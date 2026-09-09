-- 랜딩 페이지 등급 배지 아래에 등급별 인원 수/영상 등록 수를 표시하기
-- 위한 공개 통계 함수. public_stats()와 동일하게 비로그인 방문자도
-- 호출할 수 있다(개인정보 없이 집계값만 노출).
create or replace function public_level_stats()
returns table(level_code text, user_count bigint, video_count bigint)
language sql stable security definer set search_path = public as $$
  select
    l.code,
    count(distinct p.id) as user_count,
    count(distinct v.id) filter (where v.status = 'active') as video_count
  from levels l
  left join profiles p on p.current_level = l.code and p.status = 'active'
  left join videos v on v.owner_id = p.id and v.status = 'active'
  group by l.code;
$$;

grant execute on function public_level_stats() to anon, authenticated;
