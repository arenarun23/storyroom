-- 유지 만료일(level_expires_at)을 등급유지일(now())로부터 몇 개월 뒤인지로
-- 계산하되, 월/일은 등급유지일과 상관없이 무조건 그 해 12월 31일로 고정한다.
-- 기존에는 "등급유지일 + retention_months"의 정확한 날짜(예: 2027-02-18)를
-- 그대로 썼는데, 이제는 그 계산이 가리키는 연도의 12월 31일(예: 2027-12-31)로
-- 통일한다.

create or replace function retention_expiry_date(p_months integer) returns timestamptz
language plpgsql stable as $$
declare
  target_year integer;
begin
  target_year := extract(year from (now() + (p_months || ' months')::interval));
  return (make_date(target_year, 12, 31) + time '23:59:59') at time zone 'Asia/Seoul';
end;
$$;

create or replace function apply_level(
  p_user uuid, p_to_level text, p_reason text, p_change_type text, p_actor uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur_level text;
  cur_order integer;
  to_order integer;
  to_has_retention boolean;
  to_name text;
  retention_months integer;
  cooldown_months integer;
  new_expires timestamptz;
  new_lock timestamptz;
  metrics jsonb;
begin
  select current_level into cur_level from profiles where id = p_user for update;
  if cur_level is null or cur_level = p_to_level then
    return;
  end if;

  select order_no into cur_order from levels where code = cur_level;
  select order_no, has_retention, name into to_order, to_has_retention, to_name
  from levels where code = p_to_level;

  retention_months := coalesce(cfg_int('retention_months'), 6);
  cooldown_months := coalesce(cfg_int('promotion_cooldown_months'), 1);

  new_expires := case when to_has_retention then retention_expiry_date(retention_months) else null end;
  new_lock := case when to_order < cur_order then now() + (cooldown_months || ' months')::interval else null end;

  perform set_config('app.internal_write', 'on', true);

  update profiles
  set current_level = p_to_level,
      level_updated_at = now(),
      level_expires_at = new_expires,
      promotion_locked_until = new_lock
  where id = p_user;

  select to_jsonb(get_user_metrics(p_user, null)) into metrics;

  insert into level_history (user_id, from_level, to_level, level_name_snapshot, change_type, reason, actor_id, metrics_snapshot)
  values (p_user, cur_level, p_to_level, to_name, p_change_type, p_reason, p_actor, metrics);

  insert into notifications (user_id, type, title, body)
  values (
    p_user,
    case when to_order > cur_order then 'promotion' else 'demotion' end,
    case when to_order > cur_order then to_name || ' 등급으로 승급했습니다' else to_name || ' 등급으로 하락했습니다' end,
    case when new_lock is not null then '복귀 심사는 ' || to_char(new_lock, 'YYYY-MM-DD') || '부터 진행됩니다.' else null end
  );
end;
$$;

create or replace function apply_promotion(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  next_level text;
  cur_order integer;
  next_order integer;
  retention_months integer;
  cur_has_retention boolean;
begin
  select * into prof from profiles where id = p_user;
  if prof is null then return; end if;

  if prof.manual_override
     or prof.approval_status <> 'approved'
     or prof.status <> 'active' then
    return;
  end if;

  if prof.promotion_locked_until is not null and prof.promotion_locked_until > now() then
    return;
  end if;

  next_level := evaluate_level(p_user);
  select order_no into cur_order from levels where code = prof.current_level;
  select order_no into next_order from levels where code = next_level;

  if next_order > cur_order then
    perform apply_level(p_user, next_level, '승급 기준 충족', 'promotion', null);
  elsif next_order = cur_order then
    select has_retention into cur_has_retention from levels where code = prof.current_level;
    if cur_has_retention then
      retention_months := coalesce(cfg_int('retention_months'), 6);
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = retention_expiry_date(retention_months)
      where id = p_user;
    end if;
  end if;
end;
$$;

create or replace function apply_reevaluation(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  next_level text;
  cur_order integer;
  next_order integer;
  retention_months integer;
  cur_has_retention boolean;
begin
  select * into prof from profiles where id = p_user;
  if prof is null then return; end if;

  if prof.manual_override
     or prof.approval_status <> 'approved'
     or prof.status <> 'active' then
    return;
  end if;

  next_level := evaluate_level(p_user);
  select order_no into cur_order from levels where code = prof.current_level;
  select order_no into next_order from levels where code = next_level;

  if next_order < cur_order then
    perform apply_level(p_user, next_level, '기준 변경으로 인한 재판정', 'retention_demotion', null);
    return;
  end if;

  if prof.promotion_locked_until is not null and prof.promotion_locked_until > now() then
    return;
  end if;

  if next_order > cur_order then
    perform apply_level(p_user, next_level, '승급 기준 충족', 'promotion', null);
  elsif next_order = cur_order then
    select has_retention into cur_has_retention from levels where code = prof.current_level;
    if cur_has_retention then
      retention_months := coalesce(cfg_int('retention_months'), 6);
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = retention_expiry_date(retention_months)
      where id = p_user;
    end if;
  end if;
end;
$$;

create or replace function run_retention_check() returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  retention_months integer;
  since timestamptz;
  lower_level text;
begin
  retention_months := coalesce(cfg_int('retention_months'), 6);
  since := now() - (retention_months || ' months')::interval;

  for prof in
    select p.* from profiles p
    join levels l on l.code = p.current_level
    where p.level_expires_at <= now()
      and p.manual_override = false
      and p.status = 'active'
      and l.has_retention = true
  loop
    if check_rules(prof.id, prof.current_level, 'retention', since) then
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = retention_expiry_date(retention_months)
      where id = prof.id;
    else
      select code into lower_level from levels
      where order_no = (select order_no from levels where code = prof.current_level) - 1;
      perform apply_level(prof.id, coalesce(lower_level, 'L0'), '유지 기준 미충족', 'retention_demotion', null);
    end if;
  end loop;
end;
$$;

-- 이미 저장된 유지 만료일도 같은 규칙으로 맞춘다: 연도는 그대로 두고
-- 월/일만 12월 31일로 고정한다.
update profiles
set level_expires_at =
  (make_date(extract(year from level_expires_at)::int, 12, 31) + time '23:59:59') at time zone 'Asia/Seoul'
where level_expires_at is not null;
