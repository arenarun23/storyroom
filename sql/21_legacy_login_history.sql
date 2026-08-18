-- =====================================================================
-- 스토리룸 교사 그룹 — 과거 로그인 기록 조회 시도(Supabase 내부 감사 로그)
-- 01_schema.sql ~ 20_login_history_super_admin_only.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- login_history 테이블은 오늘 이후 로그인만 기록한다. 그 이전 로그인은
-- Supabase Auth(GoTrue)가 내부적으로 쌓는 auth.audit_log_entries에
-- 남아있을 수도 있어(문서화되지 않은 내부 테이블이라 보장은 없다) 최고
-- 관리자 전용으로 best-effort 조회를 시도한다. 스키마가 다르거나 접근
-- 권한이 없으면 예외를 잡아 빈 결과로 대체해 다른 기능에 영향을 주지 않는다.
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
exception when others then
  return;
end;
$$;

grant execute on function admin_legacy_login_history(uuid) to authenticated;
