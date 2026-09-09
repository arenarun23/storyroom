-- 영상/블로그 게시물 등록 시 "본인 소유"임을 확인할 수 있는 닉네임 정보를
-- 함께 받는다. 스토리룸 영상은 등급 무관하게 항상 입력(스토리룸 닉네임),
-- 유튜브 영상/블로그는 크리에이터(L2)가 마스터 승급을 노릴 때만 입력란이
-- 보인다(유튜브 채널/닉네임, 블로그 이름) — 화면단(VideoManager/BlogManager)
-- 에서 노출 여부를 제어하고, 이 컬럼 자체는 모든 레벨에 공통으로 둔다.
alter table videos add column if not exists owner_nickname text;
alter table blog_posts add column if not exists owner_nickname text;
