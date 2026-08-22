-- 블로그 게시글 수(blog_post_count)를 등급 지표 체계에 편입한다.
-- 승급 기준(level_rules)에서 선택 가능한 지표로 추가하고, 관리자가 기준설정
-- 페이지에서 크리에이터→마스터 등 원하는 등급에 규칙을 추가하면 내정보
-- 페이지의 "OO까지 남은 기준" 섹션에 자동으로 게이지가 표시된다.
-- (유지 기준에는 포함하지 않는다 — 좋아요/댓글과 같은 성격의 기록성 지표라
-- yt_views 등과 동일하게 승급 전용으로 취급)

alter type user_metrics add attribute blog_post_count integer;

create or replace function get_user_metrics(p_user uuid, p_since timestamptz default null)
returns user_metrics
language plpgsql stable security definer set search_path = public as $$
declare
  result user_metrics;
begin
  select
    count(*) filter (where platform = 'storyroom' and (p_since is null or created_at >= p_since)),
    coalesce(sum(duration_sec) filter (where platform = 'storyroom' and (p_since is null or created_at >= p_since)), 0) / 60.0,
    count(*) filter (where platform = 'youtube' and (p_since is null or created_at >= p_since)),
    coalesce(sum(yt_views) filter (where platform = 'youtube'), 0),
    coalesce(sum(yt_likes) filter (where platform = 'youtube'), 0),
    coalesce(sum(yt_comments) filter (where platform = 'youtube'), 0)
  into
    result.video_count, result.total_duration_min, result.yt_video_count,
    result.yt_views, result.yt_likes, result.yt_comments
  from videos
  where owner_id = p_user and status = 'active';

  select count(*) into result.received_likes
  from likes l join videos v on v.id = l.video_id
  where v.owner_id = p_user;

  select count(*) into result.received_comments
  from comments c join videos v on v.id = c.video_id
  where v.owner_id = p_user and c.status = 'active';

  select count(*) into result.given_likes from likes where actor_id = p_user;

  select count(*) into result.given_comments
  from comments where actor_id = p_user and status = 'active';

  select count(*) into result.blog_post_count
  from blog_posts
  where owner_id = p_user and status = 'active'
    and (p_since is null or created_at >= p_since);

  return result;
end;
$$;

create or replace function check_rules(p_user uuid, p_level text, p_rule_type text, p_since timestamptz)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  rule record;
  metrics user_metrics;
  metric_value numeric;
begin
  metrics := get_user_metrics(p_user, p_since);

  for rule in
    select * from level_rules
    where target_level = p_level and rule_type = p_rule_type and is_active = true
  loop
    metric_value := case rule.metric_key
      when 'video_count' then metrics.video_count
      when 'total_duration_min' then metrics.total_duration_min
      when 'yt_video_count' then metrics.yt_video_count
      when 'yt_views' then metrics.yt_views
      when 'yt_likes' then metrics.yt_likes
      when 'yt_comments' then metrics.yt_comments
      when 'blog_post_count' then metrics.blog_post_count
      else null
    end;

    if not (
      case rule.operator
        when '>=' then metric_value >= rule.threshold
        when '>'  then metric_value >  rule.threshold
        when '<=' then metric_value <= rule.threshold
        when '<'  then metric_value <  rule.threshold
        when '='  then metric_value =  rule.threshold
        else false
      end
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter table level_rules drop constraint if exists level_rules_metric_check;
alter table level_rules add constraint level_rules_metric_check check (
  metric_key in ('video_count','total_duration_min','yt_video_count','yt_views','yt_likes','yt_comments','blog_post_count')
  and (
    rule_type = 'promotion'
    or (rule_type = 'retention' and metric_key in ('video_count','total_duration_min','yt_video_count'))
  )
);
