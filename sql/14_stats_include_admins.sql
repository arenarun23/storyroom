-- =====================================================================
-- 스토리룸 교사 그룹 — 대시보드/랜딩페이지 통계에 관리자 계정도 포함
-- 01_schema.sql ~ 13_admin_video_reset_option.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- public_stats()가 role='user'만 세어서, 관리자로 승격된 회원(예: 실제로
-- 영상을 올리며 활동하는 계정)이 랜딩 페이지의 "참여 선생님 수"에서
-- 빠지는 문제가 있었다. 관리자 대시보드(admin/page.tsx)도 같은 필터를
-- 써서 회원관리 전체 목록과 회원 수가 어긋났다. role 조건을 제거해
-- 상태(active)만으로 집계하도록 통일한다.
-- =====================================================================

create or replace function public_stats()
returns table(teacher_count bigint, video_count bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from profiles where status = 'active') as teacher_count,
    (select count(*) from videos where status = 'active') as video_count;
$$;
