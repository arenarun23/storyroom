-- =====================================================================
-- 스토리룸 교사 그룹 — 등급 승급/강등 판정에 관리자 계정도 포함
-- 01_schema.sql ~ 15_immediate_reevaluation.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- apply_promotion/apply_reevaluation/run_retention_check/run_expiry_warnings/
-- admin_reevaluate_all이 모두 role='user'만 대상으로 삼아, 관리자로 승격된
-- 계정이 실제로 영상을 올려도 등급이 전혀 갱신되지 않았다. 통계 화면은
-- 이미 관리자를 포함하도록 고쳤으니(14_stats_include_admins.sql) 등급
-- 판정 엔진도 동일하게 role 제한을 없앤다.
-- =====================================================================

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
      retention_months := coalesce(cfg_int('retention_months'), 6);
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = now() + (retention_months || ' months')::interval
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
      update profiles set level_expires_at = now() + (retention_months || ' months')::interval
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
      update profiles set level_expires_at = now() + (retention_months || ' months')::interval
      where id = prof.id;
    else
      select code into lower_level from levels
      where order_no = (select order_no from levels where code = prof.current_level) - 1;
      perform apply_level(prof.id, coalesce(lower_level, 'L0'), '유지 기준 미충족', 'retention_demotion', null);
    end if;
  end loop;
end;
$$;

create or replace function run_expiry_warnings() returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  warn_days integer;
begin
  warn_days := coalesce(cfg_int('retention_warning_days'), 30);

  for prof in
    select p.* from profiles p
    join levels l on l.code = p.current_level
    where l.has_retention = true
      and p.level_expires_at is not null
      and p.level_expires_at <= now() + (warn_days || ' days')::interval
      and p.level_expires_at > now()
      and p.status = 'active'
      and not exists (
        select 1 from notifications n
        where n.user_id = p.id and n.type = 'expiry_warning'
          and n.created_at > now() - interval '7 days'
      )
  loop
    insert into notifications (user_id, type, title, body)
    values (
      prof.id, 'expiry_warning', '등급 유지 기준 만료 임박',
      to_char(prof.level_expires_at, 'YYYY-MM-DD') || '까지 유지 기준을 충족하지 못하면 등급이 하락합니다.'
    );
  end loop;
end;
$$;

create or replace function admin_reevaluate_all() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
  cnt integer := 0;
begin
  if not is_admin() then
    raise exception '권한이 없습니다';
  end if;

  for prof in
    select id from profiles
    where approval_status = 'approved'
      and status = 'active' and manual_override = false
  loop
    perform apply_reevaluation(prof.id);
    cnt := cnt + 1;
  end loop;

  return cnt;
end;
$$;
