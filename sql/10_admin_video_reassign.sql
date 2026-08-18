-- =====================================================================
-- 스토리룸 교사 그룹 — 거절된 영상 재승인 시 계정 재배정
-- 01_schema.sql ~ 09_admin_video_review.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- 관리자가 거절/삭제된 영상을 재승인할 때 두 가지 방법을 제공한다.
-- 1) 처음 올린 사용자 계정으로 승인 — 기존 adminSetVideoStatus(status='active')
-- 2) 완전 초기화 — 원본 기록은 남기되(status='reset', 식별정보는 비움)
--    같은 영상 내용을 다른 사용자 계정으로 새로 등록해 승인한다.
--    (예: 같은 storyroom 재내보내기 링크를 다른 사람이 잘못/대신 올린 경우)
-- =====================================================================

alter table videos drop constraint if exists videos_status_check;
alter table videos add constraint videos_status_check
  check (status in ('active','rejected','deleted','withdrawn','reset'));

create or replace function admin_reassign_video(
  p_video_id uuid, p_new_owner_id uuid, p_admin_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_platform text;
  v_title text;
  v_url text;
  v_duration_sec integer;
  v_duration_source text;
  v_thumbnail_url text;
  v_yt_video_id text;
  v_yt_channel_id text;
  v_new_id uuid;
begin
  select platform, title, url, duration_sec, duration_source, thumbnail_url, yt_video_id, yt_channel_id
  into v_platform, v_title, v_url, v_duration_sec, v_duration_source, v_thumbnail_url, v_yt_video_id, v_yt_channel_id
  from videos where id = p_video_id
  for update;

  if not found then
    raise exception '영상을 찾을 수 없습니다';
  end if;

  if not exists (select 1 from profiles where id = p_new_owner_id) then
    raise exception '대상 회원을 찾을 수 없습니다';
  end if;

  update videos
  set owner_id = null, title = null, url = null, url_key = null, thumbnail_url = null, status = 'reset'
  where id = p_video_id;

  insert into videos (
    owner_id, platform, title, url, duration_sec, duration_source,
    thumbnail_url, yt_video_id, yt_channel_id, status
  ) values (
    p_new_owner_id, v_platform, v_title, v_url, v_duration_sec, v_duration_source,
    v_thumbnail_url, v_yt_video_id, v_yt_channel_id, 'active'
  ) returning id into v_new_id;

  insert into audit_log (admin_id, action, target_table, target_id, before, after)
  values (
    p_admin_id, 'reassign_video', 'videos', p_video_id,
    jsonb_build_object('platform', v_platform, 'title', v_title, 'url', v_url),
    jsonb_build_object('reset', true, 'new_video_id', v_new_id, 'new_owner_id', p_new_owner_id)
  );

  return v_new_id;
end;
$$;

revoke execute on function admin_reassign_video(uuid, uuid, uuid) from public, anon, authenticated;
