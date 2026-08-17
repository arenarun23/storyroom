-- =====================================================================
-- 스토리룸 교사 그룹 — 최고관리자(super_admin) 등급 추가
-- 01_schema.sql ~ 04_admin.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- 권한 3단계: 일반회원(user) < 관리자(admin) < 최고관리자(super_admin)
-- - 최고관리자는 지정된 이메일 한 명만 가질 수 있다(DB CHECK로 강제).
-- - 관리자는 다른 회원을 일반회원 ↔ 관리자로만 전환할 수 있다.
-- - 최고관리자로의 승격/강등과 최고관리자 본인 행의 수정은 최고관리자만 할 수
--   있다 — 이 권한 분기는 서버 액션(adminUpdateMemberInfo)에서 강제한다.
-- =====================================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('user', 'admin', 'super_admin'));

-- 최고관리자는 지정된 이메일에만 부여될 수 있다
alter table profiles drop constraint if exists profiles_super_admin_email_check;
alter table profiles add constraint profiles_super_admin_email_check
  check (role <> 'super_admin' or email = 'arenarun23@gmail.com');

-- is_admin()은 관리자·최고관리자 모두 true — 기존 admin 전용 RLS 정책과
-- admin_* 함수들이 자동으로 최고관리자에게도 적용된다.
create or replace function is_admin(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and role in ('admin', 'super_admin'));
$$;

-- 부트스트랩: 지정된 계정을 최고관리자로 승격한다(이미 프로필이 있는 경우만).
update profiles set role = 'super_admin' where email = 'arenarun23@gmail.com';
