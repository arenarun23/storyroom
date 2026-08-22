-- 등급 유지 만료일 "수동(날짜 선택)" 모드 추가: 관리자가 달력에서 고른
-- 고정 날짜를 만료일로 사용한다 (yearly/manual과 별개의 세 번째 옵션).
insert into app_config (key, value, description)
values ('retention_manual_date', '', '고정 만료일 YYYY-MM-DD, retention_period_mode=manual_date일 때만 사용')
on conflict (key) do nothing;

update app_config
set description = '유지 만료일 계산 방식 (yearly|manual|manual_date)'
where key = 'retention_period_mode';

create or replace function retention_expiry_date() returns timestamptz
language plpgsql stable as $$
declare
  mode text;
  months integer;
  manual_date date;
begin
  mode := coalesce(cfg_text('retention_period_mode'), 'yearly');
  if mode = 'manual' then
    months := coalesce(cfg_int('retention_months'), 6);
    return now() + (months || ' months')::interval;
  elsif mode = 'manual_date' then
    manual_date := nullif(cfg_text('retention_manual_date'), '')::date;
    if manual_date is not null then
      return (manual_date + time '23:59:59') at time zone 'Asia/Seoul';
    end if;
  end if;
  return (make_date(extract(year from now())::int, 12, 31) + time '23:59:59') at time zone 'Asia/Seoul';
end;
$$;

-- 주의: 기존 회원의 level_expires_at은 여기서 건드리지 않는다. 다음
-- 승급/유지 판정이 실제로 일어날 때부터 새 계산 방식이 적용된다.
