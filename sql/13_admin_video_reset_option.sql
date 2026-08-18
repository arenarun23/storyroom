-- =====================================================================
-- 스토리룸 교사 그룹 — 초기화 기록에 원본 영상 정보 유지 + 단순 초기화 옵션
-- 01_schema.sql ~ 12_fix_reset_url_key.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- 1) 지금까지는 초기화(reset) 시 title/url까지 비워서 관리자가 영상검토
--    화면에서 "어떤 영상이 초기화됐는지" 알 수 없었다. url_key만 자리표시자로
--    바꾸고 title/url/thumbnail_url은 남겨 원본 영상을 계속 식별할 수 있게 한다.
-- 2) "다른 계정으로 승인(초기화)"에서 대상 회원을 고르지 않고 그냥 초기화만
--    하는 경우를 위해 admin_reset_video를 추가한다(재배정 없이 무효화).
-- =====================================================================

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
  set owner_id = null, url_key = 'reset:' || id::text,
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

create or replace function admin_reset_video(p_video_id uuid, p_admin_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  select jsonb_build_object('owner_id', owner_id, 'title', title, 'url', url) into v_before
  from videos where id = p_video_id
  for update;

  if v_before is null then
    raise exception '영상을 찾을 수 없습니다';
  end if;

  update videos
  set owner_id = null, url_key = 'reset:' || id::text, status = 'reset', reassigned_to_id = null
  where id = p_video_id;

  insert into audit_log (admin_id, action, target_table, target_id, before, after)
  values (p_admin_id, 'reset_video', 'videos', p_video_id, v_before, jsonb_build_object('reset', true));
end;
$$;

revoke execute on function admin_reset_video(uuid, uuid) from public, anon, authenticated;
