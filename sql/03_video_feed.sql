-- =====================================================================
-- 스토리룸 교사 그룹 — 4단계: 영상 피드 · 등급 안내
-- 시방서 v2.0 §3.3(FR-301~308) §4.4(SCR-06) §4.5(SCR-07) §4.1(SCR-05) 기준
-- 01_schema.sql, 02_promotion_cooldown.sql 다음에 실행한다.
-- 이 파일도 재실행에 안전하다(멱등).
-- =====================================================================

-- §8.3 RLS 매트릭스는 profiles 조회 권한을 "로그인 사용자"로 규정한다.
-- 01_schema.sql이 이미 이 정책으로 만들어져 있지만, 예전 버전으로 이미
-- 마이그레이션한 프로젝트를 위해 여기서도 안전하게 다시 맞춰준다.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);

-- 영상 피드용 커서 기반 페이지네이션 (FR-307, FR-308).
-- 좋아요/댓글 수는 (metric, created_at, id) 3중 키셋 비교로, 최신순은
-- (created_at, id)로 정렬이 흔들리지 않게 페이지네이션한다.
drop function if exists list_videos_feed(text, text, bigint, timestamptz, uuid, integer);

create function list_videos_feed(
  p_sort text default 'latest',            -- 'latest' | 'likes' | 'comments'
  p_level text default null,               -- 등급 코드 필터, null이면 전체
  p_cursor_metric bigint default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  owner_id uuid,
  owner_name text,
  owner_level text,
  platform text,
  title text,
  url text,
  yt_video_id text,
  duration_sec integer,
  status text,
  created_at timestamptz,
  like_count bigint,
  comment_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      v.id,
      v.owner_id,
      p.display_name as owner_name,
      p.current_level as owner_level,
      v.platform,
      v.title,
      v.url,
      v.yt_video_id,
      v.duration_sec,
      v.status,
      v.created_at,
      (select count(*) from likes l where l.video_id = v.id)::bigint as like_count,
      (select count(*) from comments c where c.video_id = v.id and c.status = 'active')::bigint as comment_count
    from videos v
    left join profiles p on p.id = v.owner_id
    -- 삭제·탈퇴 영상도 회색 카드로 노출한다(§4.4). 소유권 불일치로 거부된
    -- 영상만 피드에서 완전히 제외한다.
    where v.status in ('active', 'deleted', 'withdrawn')
      and (p_level is null or p.current_level = p_level)
  )
  select * from base
  where
    case p_sort
      when 'likes' then
        p_cursor_metric is null
        or (like_count, created_at, id) < (p_cursor_metric, p_cursor_created_at, p_cursor_id)
      when 'comments' then
        p_cursor_metric is null
        or (comment_count, created_at, id) < (p_cursor_metric, p_cursor_created_at, p_cursor_id)
      else
        p_cursor_created_at is null
        or (created_at, id) < (p_cursor_created_at, p_cursor_id)
    end
  order by
    case when p_sort = 'likes' then like_count end desc nulls last,
    case when p_sort = 'comments' then comment_count end desc nulls last,
    created_at desc,
    id desc
  limit p_limit;
$$;

grant execute on function list_videos_feed(text, text, bigint, timestamptz, uuid, integer) to authenticated;
