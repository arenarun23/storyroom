-- =====================================================================
-- 스토리룸 교사 그룹 — 레벨 이름 변경 (LEVEL 0~3 → Starter/Beginner/Creator/Master)
-- 01_schema.sql ~ 17_fix_reevaluate_all_permission.sql 다음에 실행한다. 재실행에 안전하다(멱등).
-- =====================================================================

update levels set name = 'Starter' where code = 'L0';
update levels set name = 'Beginner' where code = 'L1';
update levels set name = 'Creator' where code = 'L2';
update levels set name = 'Master' where code = 'L3';
