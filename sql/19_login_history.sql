-- =====================================================================
-- 스토리룸 교사 그룹 — 회원별 로그인 기록
-- 01_schema.sql ~ 18_rename_levels.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- 구글 로그인(/auth/callback)과 관리자 이메일 로그인(/admin/login) 성공
-- 시점에 서버 액션이 이 테이블에 기록을 남긴다. audit_log와 동일한 패턴으로
-- 조회는 관리자만, 쓰기는 서비스 롤로만 한다.
-- =====================================================================

drop table if exists login_history cascade;

create table login_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  ip_address  text,
  user_agent  text
);

create index idx_login_history_user on login_history(user_id, logged_in_at desc);

alter table login_history enable row level security;

-- login_history: admin만 조회, 쓰기는 시스템(서비스 롤)
create policy login_history_select on login_history for select to authenticated
  using (is_admin());
