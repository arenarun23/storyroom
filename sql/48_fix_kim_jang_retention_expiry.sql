-- 김민경/장정주 두 회원은 sql/47(등급별 고정 유지기간)이 적용되기 전 시점에
-- 등급 변경(하강)이 일어나 유지 만료일이 예전 방식(해당연도 12월 31일)으로
-- 남아 있었다. 승급/하강일(level_updated_at)과 유지기간이 맞지 않는다는
-- 신고로 확인 — 같은 시점에 등급이 바뀐 다른 회원들은 이미 새 방식(승급일
-- +365/1095일)으로 정상 계산되어 있으므로, 이 두 회원만 다시 계산한다.
update profiles
set level_expires_at = retention_expiry_date(current_level, level_updated_at)
where id in (
  '156c7d8c-ec71-423e-b7c4-908983ab81fa', -- 김민경
  '246f8d8f-9182-4be9-a860-7ea922946380'  -- 장정주
)
and manual_override = false;
