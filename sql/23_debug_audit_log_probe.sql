-- =====================================================================
-- 임시 디버그: auth.audit_log_entries 테이블 자체에 데이터가 있는지,
-- payload 필드 구조가 어떤지 확인한다. 진단 후 삭제할 함수다.
-- payload 컬럼은 jsonb가 아니라 json 타입이다.
-- =====================================================================

create or replace function admin_debug_audit_probe()
returns table(total_rows bigint, sample_payload json, sample_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'super_admin') then
    raise exception '권한이 없습니다';
  end if;

  return query
  select
    (select count(*) from auth.audit_log_entries),
    a.payload,
    a.created_at
  from auth.audit_log_entries a
  order by a.created_at desc
  limit 1;
end;
$$;

grant execute on function admin_debug_audit_probe() to authenticated;
