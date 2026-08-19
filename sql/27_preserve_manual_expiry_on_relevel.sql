-- 26번 마이그레이션에서 "같은 등급으로 강제 재적용"을 허용하도록 apply_level을
-- 고쳤는데, 이때 유지 만료일을 항상 retention_expiry_date()로 재계산해
-- 버려서, 관리자가 유지 만료일을 수동으로 지정해 둔 값(예: 9999-12-31)이
-- 등급을 다시 적용하기만 해도 원래대로 되돌아가는 문제가 있었다.
-- 실제로 등급이 바뀔 때만 유지 만료일을 새로 계산하고, 등급이 그대로인
-- 강제 재적용에서는 기존 만료일을 보존하도록 고친다.

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
    when to_order is distinct from cur_order then (case when to_has_retention then retention_expiry_date() else null end)
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
