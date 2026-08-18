-- =====================================================================
-- 임시 디버그: admin_legacy_login_history의 예외 스왑을 제거해 실제 오류를 노출한다.
-- 문제를 진단한 뒤 원상복구(예외 처리 다시 추가)할 예정이다.
-- =====================================================================

create or replace function admin_legacy_login_history(p_user uuid)
returns table(logged_in_at timestamptz, action text, ip_address text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'super_admin') then
    raise exception '권한이 없습니다';
  end if;

  return query
  select a.created_at, a.payload->>'action', nullif(a.ip_address, '')
  from auth.audit_log_entries a
  where a.payload->>'actor_id' = p_user::text
  order by a.created_at desc
  limit 50;
end;
$$;
