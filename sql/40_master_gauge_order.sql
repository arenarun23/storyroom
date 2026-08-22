-- 마스터 승급 게이지 순서를 누적 재생시간 → 스토리룸 영상 편수 →
-- 유튜브 홍보 영상 편수 → 블로그 홍보 게시글 수로 재조정한다.

update level_rules
set sort_order = 1
where target_level = 'L3' and rule_type = 'promotion' and is_active = true and metric_key = 'video_count';

update level_rules
set sort_order = 2
where target_level = 'L3' and rule_type = 'promotion' and is_active = true and metric_key = 'yt_video_count';

update level_rules
set sort_order = 3
where target_level = 'L3' and rule_type = 'promotion' and is_active = true and metric_key = 'blog_post_count';
