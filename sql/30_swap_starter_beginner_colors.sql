-- 새 배지 이미지(초록 새싹 = Starter, 회색/골드 = Beginner)와 맞지 않게
-- badge_color가 반대로(Starter=회색, Beginner=초록) 들어가 있던 것을 바로잡는다.

update levels set badge_color = '#6BD3C4,#2A9187' where code = 'L0';
update levels set badge_color = '#C3CFCD,#8B9B98' where code = 'L1';
