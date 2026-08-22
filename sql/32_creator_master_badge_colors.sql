-- Creator/Master의 badge_color가 예전 육각형 배지 시절 색(청록/골드)에
-- 머물러 있어서, 실제 배지 이미지(파란색 Creator, 보라색 Master)와
-- 어긋나 있었다. 실제 배지 아트워크에서 뽑은 색으로 맞춘다.

update levels set badge_color = '#5EABEE,#0044A6' where code = 'L2';
update levels set badge_color = '#B18AE0,#490B5C' where code = 'L3';
