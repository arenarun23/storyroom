-- 관리자 "등급 수동 조정"이 현재 등급과 같은 값을 다시 적용할 때 조용히
-- 아무 일도 하지 않던 문제를 고친다. apply_level은 원래 cur_level = p_to_level이면
-- 그냥 return 해버렸는데(변경 이력도, 알림도, level_updated_at 갱신도 없음),
-- 이 경우 RPC 자체는 에러 없이 성공해 관리자 페이지에는 "적용됨"으로 보이지만
-- 실제로는 아무것도 반영되지 않았다. p_change_type = 'manual'(관리자 강제 변경)
-- 일 때는 같은 등급이어도 무조건 재적용하도록 바꾼다.
--
-- retention_expiry_date()가 아직 없는 환경(25번 마이그레이션 미실행)에서도
-- 이 파일 하나로 안전하게 적용되도록 함께 재정의한다.

create or replace function retention_expiry_date() returns timestamptz
language plpgsql stable as $$
begin
  return (make_date(extract(year from now())::int, 12, 31) + time '23:59:59') at time zone 'Asia/Seoul';
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
  cooldown_months integer;
  new_expires timestamptz;
  new_lock timestamptz;
  metrics jsonb;
begin
  select current_level into cur_level from profiles where id = p_user for update;
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

  new_expires := case when to_has_retention then retention_expiry_date() else null end;
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
