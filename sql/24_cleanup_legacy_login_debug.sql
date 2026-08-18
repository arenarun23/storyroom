-- =====================================================================
-- 스토리룸 교사 그룹 — 과거 로그인 기록 조회 디버그 정리
-- 01_schema.sql ~ 23_debug_audit_log_probe.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- auth.audit_log_entries를 확인한 결과 0건 — 이 Supabase 프로젝트에는
-- 조회 가능한 과거 로그인 기록이 없다(테이블 자체가 비어있음, 스키마
-- 문제가 아니었다). admin_legacy_login_history를 예외 처리가 있는
-- 안전한 최종 버전으로 되돌리고, 디버그용 프로브 함수는 삭제한다.
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

drop function if exists admin_debug_audit_probe();
