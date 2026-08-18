-- =====================================================================
-- 스토리룸 교사 그룹 — 관리자 영상 삭제/재승인
-- 01_schema.sql ~ 08_rule_ordering.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- trg_validate_video_fn은 유튜브 영상을 active로 바꿀 때마다 소유권을
-- 재검사한다(FR-504). 유튜브 채널 인증 기능(8단계)이 아직 없어서 모든
-- 유튜브 영상이 이 검사에서 항상 걸려 rejected로 남는데, 관리자가
-- service role로 수동 재승인할 때는 이 재검사를 건너뛰도록 한다 —
-- trg_guard_profile과 동일한 패턴이다. 일반 회원의 등록 경로는 그대로
-- 검사를 적용받는다.
-- =====================================================================

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
      new.status := 'rejected'; -- FR-504
    end if;
  end if;

  return new;
end;
$$;
