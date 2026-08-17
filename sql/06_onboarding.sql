-- =====================================================================
-- 스토리룸 교사 그룹 — 최초 로그인 온보딩(추가 정보 입력)
-- 01_schema.sql ~ 05_superadmin.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- 성명·소속시도·연락처는 필수, 소속학교는 선택. 보호 컬럼이 아니므로
-- 본인이 직접 저장할 수 있다(RLS profiles_update 정책으로 이미 허용됨).
-- =====================================================================

alter table profiles add column if not exists real_name text;
alter table profiles add column if not exists region text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists school_name text;

alter table profiles drop constraint if exists profiles_region_check;
alter table profiles add constraint profiles_region_check
  check (region is null or region in (
    '서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시',
    '울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도',
    '전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도'
  ));
