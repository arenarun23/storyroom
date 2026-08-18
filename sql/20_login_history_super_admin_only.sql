-- =====================================================================
-- 스토리룸 교사 그룹 — 로그인 기록은 최고관리자만 조회 가능
-- 01_schema.sql ~ 19_login_history.sql 다음에 실행한다. 재실행에 안전하다(멱등).
-- =====================================================================

drop policy if exists login_history_select on login_history;

create policy login_history_select on login_history for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));
