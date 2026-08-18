-- =====================================================================
-- 스토리룸 교사 그룹 — 복귀 유예기간(Promotion Cooldown) 마이그레이션
-- 시방서 v2.0 §3.4(FR-412~414) §6.4 §7.4 §7.5 기준
--
-- 01_schema.sql에는 복귀 유예기간 로직이 이미 통합되어 있으므로 이 파일은
-- 멱등(idempotent)하게 작성되어 있다. 01_schema.sql 다음에 실행하며,
-- 여러 번 다시 실행해도 안전하다.
-- =====================================================================

alter table profiles add column if not exists promotion_locked_until timestamptz;

insert into app_config (key, value, description)
values ('promotion_cooldown_months', '1', '복귀 유예기간(개월)')
on conflict (key) do nothing;

-- apply_level: 강등 시 유예기간 잠금, 승급 시 잠금 해제
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

  new_expires := case when to_has_retention then now() + (retention_months || ' months')::interval else null end;
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

-- apply_promotion: 유예 중이면 판정 보류 (BR-007: 지표는 계속 누적)
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
      update profiles set level_expires_at = now() + (retention_months || ' months')::interval
      where id = p_user;
    end if;
  end if;
end;
$$;

-- run_cooldown_release: 유예 종료자를 즉시 재판정 (강등 처리 이후 실행되어야 함)
create or replace function run_cooldown_release() returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
begin
  for prof in
    select * from profiles
    where promotion_locked_until is not null and promotion_locked_until <= now()
  loop
    perform set_config('app.internal_write', 'on', true);
    update profiles set promotion_locked_until = null where id = prof.id;
    perform apply_promotion(prof.id);
  end loop;
end;
$$;

-- 관리자가 복귀 유예를 조기 해제할 때 사용 (FR-712)
create or replace function release_cooldown_early(p_user uuid, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.internal_write', 'on', true);
  update profiles set promotion_locked_until = null where id = p_user;

  insert into audit_log (admin_id, action, target_table, target_id, after)
  values (p_admin, 'release_cooldown_early', 'profiles', p_user::text, jsonb_build_object('promotion_locked_until', null));

  perform apply_promotion(p_user);
end;
$$;

revoke execute on function release_cooldown_early(uuid, uuid) from public, anon, authenticated;
