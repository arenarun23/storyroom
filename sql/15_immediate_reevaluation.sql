-- =====================================================================
-- 스토리룸 교사 그룹 — 등급 기준 변경 시 즉시 승급/강등 반영
-- 01_schema.sql ~ 14_stats_include_admins.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- 기존 apply_promotion()은 승급만 즉시 반영하고 강등은 유지 만료일 도달 시
-- run_retention_check()로만 처리했다(이미 승급한 회원을 규정 변경만으로
-- 소급 강등하지 않으려는 설계). 관리자가 등급 기준을 직접 바꿨을 때는
-- 즉시 승급/강등이 모두 반영되길 원하므로, apply_promotion과 별도로
-- apply_reevaluation()을 두고 admin_reevaluate_all()이 이를 사용하도록 한다.
-- 영상 등록 등 평소 트리거 흐름은 기존 apply_promotion 그대로 사용해
-- 즉시 강등 범위를 "관리자가 기준을 바꿔 전체 재판정할 때"로 한정한다.
-- =====================================================================

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
     or prof.status <> 'active'
     or prof.role <> 'user' then
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
      retention_months := coalesce(cfg_int('retention_months'), 6);
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = now() + (retention_months || ' months')::interval
      where id = p_user;
    end if;
  end if;
end;
$$;

revoke execute on function apply_reevaluation(uuid) from public, anon, authenticated;

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
    where role = 'user' and approval_status = 'approved'
      and status = 'active' and manual_override = false
  loop
    perform apply_reevaluation(prof.id);
    cnt := cnt + 1;
  end loop;

  return cnt;
end;
$$;
