-- 유튜브 채널 인증이 없는 상태에서 유튜브 링크를 등록하면 지금까지는
-- 바로 status='rejected'로 떨어져서, 회원 본인의 "내 영상 목록"에서도
-- 안 보이고(목록이 status='active'만 조회) 관리자 화면에는 "거절"로
-- 표시됐다. 실제로는 관리자가 수동으로 검토해서 승인/거절을 정할 대상이므로
-- 'pending'(승인 대기) 상태를 새로 만들어 그쪽으로 보낸다.

-- videos.status 체크 제약을 이름에 의존하지 않고 동적으로 찾아 교체한다
-- (재실행 시에도 안전).
do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  join pg_class tbl on tbl.oid = con.conrelid
  where tbl.relname = 'videos'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%status%active%rejected%deleted%';

  if con_name is not null then
    execute format('alter table videos drop constraint %I', con_name);
  end if;
end $$;

alter table videos add constraint videos_status_check
  check (status in ('active', 'pending', 'rejected', 'deleted', 'withdrawn', 'reset'));

create or replace function trg_validate_video_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_min integer;
  avg_duration numeric;
  is_trusted_write boolean;
begin
  if new.url_key is null and new.url is not null then
    new.url_key := lower(regexp_replace(regexp_replace(new.url, '[?#].*$', ''), '/+$', ''));
  end if;

  max_min := coalesce(cfg_int('max_video_duration_min'), 30);
  if new.duration_sec > max_min * 60 then
    raise exception '영상 시간이 상한(%분)을 넘습니다', max_min;
  end if;

  select avg(duration_sec) into avg_duration
  from videos where platform = new.platform and status = 'active';

  if avg_duration is not null and new.duration_sec > avg_duration * 3 then
    new.is_flagged := true;
  end if;

  is_trusted_write := coalesce(auth.role(), 'service_role') = 'service_role';

  if new.platform = 'youtube' and new.status = 'active' and not is_trusted_write then
    if not exists (
      select 1 from profiles
      where id = new.owner_id and yt_channel_id = new.yt_channel_id and yt_verified_at is not null
    ) then
      new.status := 'pending'; -- 채널 인증 전이면 관리자 검토 대기
    end if;
  end if;

  return new;
end;
$$;

-- 이미 자동 거절돼 있던 유튜브 영상 중, 관리자가 따로 거절 처리한 적 없는
-- 것들을 승인 대기로 되돌린다(감사로그에 admin_id가 있는 거절 건은 관리자가
-- 실제로 검토해서 거절한 것이므로 건드리지 않는다).
update videos v
set status = 'pending'
where v.platform = 'youtube'
  and v.status = 'rejected'
  and not exists (
    select 1 from audit_log a
    where a.target_table = 'videos' and a.target_id = v.id::text
      and a.action in ('reject_video', 'delete_video')
  );
