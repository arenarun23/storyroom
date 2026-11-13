-- =====================================================================
-- 51: 비로그인(anon) 함수 실행 권한 회수
-- 50_narrow_profiles_rls.sql 다음에 실행한다. 재실행에 안전하다(멱등).
-- 운영 DB(storyroompj)에는 2026-11-13 적용 완료.
--
-- 보안 점검(2026-11) 발견: Supabase는 public 스키마에 새로 만든 함수의
-- 실행 권한을 anon(비로그인)에게도 기본으로 준다. 그래서 공개 키만으로
-- 로그인 없이 다음이 조회됐다.
--   - list_active_admins()      : 관리자 전원의 이름·이메일·ID
--   - messaging_contact_info()  : 관리자 이름·이메일
--   - public_profile_card()     : 아무 회원의 이름·프로필 사진·등급
--   - list_videos_feed()        : 영상 피드 전체(작성자 실명·영상 주소)
-- 비로그인 화면(랜딩)에 필요한 함수는 public_stats(), public_level_stats() 둘뿐이다.
--
-- 방식: public 스키마의 모든 함수에서 anon/PUBLIC 실행 권한을 거두되,
-- 지금 로그인 사용자(authenticated)가 실행할 수 있던 함수는 그 권한을
-- 명시적으로 다시 준다(PUBLIC 회수로 로그인 기능이 깨지지 않도록).
-- 앞으로 만드는 함수도 기본적으로 anon에게 열리지 않게 기본 권한을 바꾼다.
-- =====================================================================

do $$
declare
  f record;
  had_auth boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (            -- 확장(extension)이 만든 함수는 건드리지 않는다
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    had_auth := has_function_privilege('authenticated', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    if had_auth then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end
$$;

-- 랜딩 페이지(비로그인)용 집계 함수만 다시 연다(개인정보 없음).
grant execute on function public_stats() to anon, authenticated;
grant execute on function public_level_stats() to anon, authenticated;

-- 앞으로 이 스키마에 만드는 함수는 anon/PUBLIC에 자동으로 열지 않는다.
-- (Supabase SQL Editor는 postgres 역할로 실행되므로 그 역할의 기본값을 바꾼다)
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- 확인용(선택): 아래 결과가 public_stats, public_level_stats 두 줄이면 적용 완료.
-- select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
