-- =====================================================================
-- 스토리룸 교사 그룹 — 전체 재판정 실행 권한 체크 버그 수정
-- 01_schema.sql ~ 16_include_admins_in_leveling.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- admin_reevaluate_all()이 내부에서 is_admin()(auth.uid() 기반)으로 다시
-- 권한을 검사했는데, 이 함수는 서버 액션에서 서비스 롤 클라이언트로
-- 호출된다. 서비스 롤 호출에는 auth.uid()가 없어(null) is_admin()이 항상
-- false를 반환해 "권한이 없습니다" 오류로 항상 실패했다(기존 "전체
-- 재판정 실행" 버튼부터 있던 버그). 권한 확인은 이미 Next.js 서버
-- 액션의 requireAdmin()에서 하고 있으므로, admin_reassign_video 등
-- 다른 서비스 롤 전용 함수와 동일하게 내부 is_admin() 검사를 제거하고
-- anon/authenticated에서 실행 권한을 회수해 서비스 롤로만 호출 가능하게 한다.
-- =====================================================================

create or replace function admin_reevaluate_all() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
  cnt integer := 0;
begin
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

revoke execute on function admin_reevaluate_all() from public, anon, authenticated;
