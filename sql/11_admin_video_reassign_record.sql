-- =====================================================================
-- 스토리룸 교사 그룹 — 초기화된 영상에 재배정 대상 계정 기록 남기기
-- 01_schema.sql ~ 10_admin_video_reassign.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- 관리자가 "다른 계정으로 승인(초기화)"를 실행하면 원본 영상 행의 소유자
-- 정보(owner_id 등)는 비워지는데(status='reset'), 이때 어느 계정으로
-- 재배정했는지 알 수 있도록 reassigned_to_id에 남겨 영상검토 화면에 표시한다.
-- =====================================================================

alter table videos add column if not exists reassigned_to_id uuid references profiles(id) on delete set null;

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
  set owner_id = null, title = null, url = null, url_key = null, thumbnail_url = null,
      status = 'reset', reassigned_to_id = p_new_owner_id
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
