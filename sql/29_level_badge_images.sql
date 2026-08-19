-- 등급별 육각형 마크를 새로 제작한 원형 배지 이미지(public/badges/*.png)로
-- 교체한다. LevelBadge 컴포넌트가 badge_image_url이 있으면 그 이미지를
-- 그대로(육각형 클리핑 없이) 보여준다.

update levels set badge_image_url = '/badges/starter.png' where code = 'L0';
update levels set badge_image_url = '/badges/beginner.png' where code = 'L1';
update levels set badge_image_url = '/badges/creator.png' where code = 'L2';
update levels set badge_image_url = '/badges/master.png' where code = 'L3';
