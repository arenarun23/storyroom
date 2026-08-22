-- 1) 등급 카드 문구를 관리자가 직접 쓰고 지울 수 있도록 levels에 자유
--    텍스트 컬럼 추가(줄바꿈 = 항목 하나). 비어 있으면 기존처럼 기준설정
--    데이터로 자동 생성한 문구를 보여준다.
alter table levels add column if not exists promotion_note text;
alter table levels add column if not exists retention_note text;

-- 2) 유지 만료일 계산 방식을 관리자가 고를 수 있게 설정 추가.
--    yearly(기본): 갱신 시점 연도의 12월 31일까지.
--    manual: 갱신 시점으로부터 retention_months개월 뒤까지.
insert into app_config (key, value, description)
values ('retention_period_mode', 'yearly', '유지 만료일 계산 방식 (yearly|manual)')
on conflict (key) do nothing;

update app_config
set description = '유지기간(개월, retention_period_mode=manual일 때만 사용)'
where key = 'retention_months';

create or replace function retention_expiry_date() returns timestamptz
language plpgsql stable as $$
declare
  mode text;
  months integer;
begin
  mode := coalesce(cfg_text('retention_period_mode'), 'yearly');
  if mode = 'manual' then
    months := coalesce(cfg_int('retention_months'), 6);
    return now() + (months || ' months')::interval;
  end if;
  return (make_date(extract(year from now())::int, 12, 31) + time '23:59:59') at time zone 'Asia/Seoul';
end;
$$;

-- 주의: 이미 등급을 부여받은 기존 회원의 level_expires_at은 여기서 건드리지
-- 않는다. 다음 승급/유지 판정이 실제로 일어날 때부터 새 계산 방식이 적용된다.
