-- 등급 유지기간을 등급별 고정 일수(승급/하강일 기준)로 변경한다.
-- 스타터는 무제한(has_retention=false로 이미 무제한), 비기너/크리에이터는
-- 승급일로부터 365일, 마스터는 승급일로부터 1095일(3년) 유지.
-- "승급일"은 profiles.level_updated_at을 그대로 쓴다 — 이 컬럼은 apply_level()이
-- 등급이 오르내릴 때마다(승급이든 하락이든) now()로 갱신하므로, 별도 컬럼 없이도
-- "레벨이 올라가면 상위 레벨 승급일 / 떨어지면 하강일" 요건을 그대로 만족한다.
--
-- 기준설정 페이지의 "유지 만료일 계산 방식" 드롭다운(관리자 수동 override)은
-- 그대로 유지한다: mode='manual'|'manual_date'를 선택하면 기존처럼 전역 값으로
-- 덮어쓰고, 기본값인 mode='yearly'일 때만 이 등급별 고정 일수 방식을 쓴다.

alter table levels add column if not exists retention_days integer;

update levels set retention_days = 365 where code in ('L1', 'L2');
update levels set retention_days = 1095 where code = 'L3';

drop function if exists retention_expiry_date() cascade;

create function retention_expiry_date(p_level text, p_anchor timestamptz default now())
returns timestamptz
language plpgsql stable as $$
declare
  mode text;
  months integer;
  manual_date date;
  days integer;
begin
  mode := coalesce(cfg_text('retention_period_mode'), 'yearly');
  if mode = 'manual' then
    months := coalesce(cfg_int('retention_months'), 6);
    return now() + (months || ' months')::interval;
  elsif mode = 'manual_date' then
    manual_date := nullif(cfg_text('retention_manual_date'), '')::date;
    if manual_date is not null then
      return (manual_date + time '23:59:59') at time zone 'Asia/Seoul';
    end if;
  end if;

  select retention_days into days from levels where code = p_level;
  if days is null then
    return null;
  end if;
  return p_anchor + (days || ' days')::interval;
end;
$$;

-- §7.5: 등급 변경 적용 + 이력 기록 + 알림 생성 (retention_expiry_date 시그니처 변경 반영)
create or replace function apply_level(
  p_user uuid, p_to_level text, p_reason text, p_change_type text, p_actor uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur_level text;
  cur_expires timestamptz;
  cur_order integer;
  to_order integer;
  to_has_retention boolean;
  to_name text;
  cooldown_months integer;
  new_expires timestamptz;
  new_lock timestamptz;
  metrics jsonb;
begin
  select current_level, level_expires_at into cur_level, cur_expires from profiles where id = p_user for update;
  if cur_level is null then
    return;
  end if;
  if cur_level = p_to_level and p_change_type <> 'manual' then
    return;
  end if;

  select order_no into cur_order from levels where code = cur_level;
  select order_no, has_retention, name into to_order, to_has_retention, to_name
  from levels where code = p_to_level;

  cooldown_months := coalesce(cfg_int('promotion_cooldown_months'), 1);

  new_expires := case
    when to_order is distinct from cur_order then (case when to_has_retention then retention_expiry_date(p_to_level, now()) else null end)
    else cur_expires
  end;
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

  if to_order is distinct from cur_order then
    insert into notifications (user_id, type, title, body)
    values (
      p_user,
      case when to_order > cur_order then 'promotion' else 'demotion' end,
      case when to_order > cur_order then to_name || ' 등급으로 승급했습니다' else to_name || ' 등급으로 하락했습니다' end,
      case when new_lock is not null then '복귀 심사는 ' || to_char(new_lock, 'YYYY-MM-DD') || '부터 진행됩니다.' else null end
    );
  end if;
end;
$$;

-- §7.2: 승급 판정 (수동조정/미승인/정지/유예 중이면 보류)
create or replace function apply_promotion(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  next_level text;
  cur_order integer;
  next_order integer;
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
    return; -- 복귀 유예 중: 판정 보류, 지표는 계속 누적됨(BR-007)
  end if;

  next_level := evaluate_level(p_user);
  select order_no into cur_order from levels where code = prof.current_level;
  select order_no into next_order from levels where code = next_level;

  if next_order > cur_order then
    perform apply_level(p_user, next_level, '승급 기준 충족', 'promotion', null);
  elsif next_order = cur_order then
    select has_retention into cur_has_retention from levels where code = prof.current_level;
    if cur_has_retention then
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = retention_expiry_date(prof.current_level, prof.level_updated_at)
      where id = p_user;
    end if;
  end if;
end;
$$;

-- 관리자가 등급 기준을 바꾼 뒤 전체 재판정할 때 사용.
create or replace function apply_reevaluation(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  next_level text;
  cur_order integer;
  next_order integer;
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
    return; -- 승급 잠금(복귀 유예) 중에는 승급·유지 갱신을 보류한다
  end if;

  if next_order > cur_order then
    perform apply_level(p_user, next_level, '승급 기준 충족', 'promotion', null);
  elsif next_order = cur_order then
    select has_retention into cur_has_retention from levels where code = prof.current_level;
    if cur_has_retention then
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = retention_expiry_date(prof.current_level, prof.level_updated_at)
      where id = p_user;
    end if;
  end if;
end;
$$;

revoke execute on function apply_reevaluation(uuid) from public, anon, authenticated;

-- §7.3: 유지 심사 및 강등 (매일 배치)
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
      update profiles set level_expires_at = retention_expiry_date(prof.current_level, prof.level_updated_at)
      where id = prof.id;
    else
      select code into lower_level from levels
      where order_no = (select order_no from levels where code = prof.current_level) - 1;
      perform apply_level(prof.id, coalesce(lower_level, 'L0'), '유지 기준 미충족', 'retention_demotion', null);
    end if;
  end loop;
end;
$$;

revoke execute on function apply_promotion(uuid) from public, anon, authenticated;
revoke execute on function run_retention_check() from public, anon, authenticated;

-- 주의: 기존 회원의 level_expires_at은 여기서 건드리지 않는다. 다음
-- 승급/유지 판정이 실제로 일어날 때부터 새 계산 방식이 적용된다.
