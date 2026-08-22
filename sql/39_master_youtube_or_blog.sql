-- 마스터 승급 조건에서 "유튜브 홍보 영상" 또는 "블로그 홍보 게시물" 중
-- 하나만 충족하면 되도록 한다. level_rules에 rule_group 컬럼을 추가해,
-- 같은 그룹끼리는 하나만 만족(OR)하면 통과하고 그룹이 다르거나 그룹이
-- 없는 규칙은 기존처럼 전부 만족(AND)해야 하는 구조로 확장한다.
--
-- 내정보 페이지의 "OO까지 남은 기준" 게이지 순서: 누적 재생시간 →
-- 유튜브 영상 편수 → 블로그 홍보 게시물 수 → 스토리룸 영상 편수.

alter table level_rules add column if not exists rule_group integer;

create or replace function check_rules(p_user uuid, p_level text, p_rule_type text, p_since timestamptz)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  rule record;
  metrics user_metrics;
  metric_value numeric;
  grp integer;
  group_passed boolean;
begin
  metrics := get_user_metrics(p_user, p_since);

  for rule in
    select * from level_rules
    where target_level = p_level and rule_type = p_rule_type and is_active = true and rule_group is null
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

  for grp in
    select distinct rule_group from level_rules
    where target_level = p_level and rule_type = p_rule_type and is_active = true and rule_group is not null
  loop
    group_passed := false;

    for rule in
      select * from level_rules
      where target_level = p_level and rule_type = p_rule_type and is_active = true and rule_group = grp
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

      if (
        case rule.operator
          when '>=' then metric_value >= rule.threshold
          when '>'  then metric_value >  rule.threshold
          when '<=' then metric_value <= rule.threshold
          when '<'  then metric_value <  rule.threshold
          when '='  then metric_value =  rule.threshold
          else false
        end
      ) then
        group_passed := true;
        exit;
      end if;
    end loop;

    if not group_passed then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- 기존 마스터 유튜브 규칙을 1번 그룹으로 지정하고 표시 순서를 맞춘다.
update level_rules
set rule_group = 1, sort_order = 1
where target_level = 'L3' and rule_type = 'promotion' and is_active = true and metric_key = 'yt_video_count';

update level_rules
set sort_order = 3
where target_level = 'L3' and rule_type = 'promotion' and is_active = true and metric_key = 'video_count';

-- 블로그 게시물 규칙을 같은 그룹(1번)으로 추가한다. 이미 있으면 건너뛴다.
insert into level_rules (target_level, rule_type, metric_key, operator, threshold, is_active, sort_order, rule_group)
select 'L3', 'promotion', 'blog_post_count', '>=', 1, true, 2, 1
where not exists (
  select 1 from level_rules
  where target_level = 'L3' and rule_type = 'promotion' and metric_key = 'blog_post_count' and is_active = true
);
