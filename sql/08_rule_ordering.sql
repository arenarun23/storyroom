-- =====================================================================
-- 스토리룸 교사 그룹 — 기준 설정 화면 수동 순서 조절
-- 01_schema.sql ~ 07_member_management.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- sort_order는 표시 순서만 담당하며 판정 로직(check_rules)은 규칙을
-- 순서 없이 전부 AND로 평가하므로 이 컬럼이 등급 판정 결과에 영향을 주지 않는다.
-- =====================================================================

alter table level_rules add column if not exists sort_order integer not null default 0;

-- 최초 1회만 등급별로 순서를 채운다. 이미 누군가 순서를 조정했거나 백필을
-- 마쳤다면(0이 아닌 값이 하나라도 있으면) 다시 실행해도 건드리지 않는다.
do $$
begin
  if not exists (select 1 from level_rules where sort_order <> 0) then
    with ranked as (
      select id, row_number() over (partition by target_level order by rule_type, metric_key) - 1 as rn
      from level_rules
    )
    update level_rules lr set sort_order = ranked.rn
    from ranked
    where lr.id = ranked.id;
  end if;
end $$;
