-- =====================================================================
-- 스토리룸 교사 그룹 — 영상 초기화 시 url_key NOT NULL 위반 수정
-- 01_schema.sql ~ 11_admin_video_reassign_record.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- videos.url_key는 not null unique라서 "다른 계정으로 승인(초기화)" 시
-- url_key = null로 설정하면 not-null 제약 위반으로 실패한다(회원 탈퇴 시
-- withdraw_user에도 동일한 버그가 있었다). null 대신 영상 id 기반의
-- 유일한 자리표시자 값을 넣어 유니크 제약을 만족시키면서 원래 url과는
-- 절대 충돌하지 않게 한다.
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
  set owner_id = null, title = null, url = null, url_key = 'reset:' || id::text, thumbnail_url = null,
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

create or replace function withdraw_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from ai_feedbacks where video_id in (select id from videos where owner_id = p_user);
  delete from video_transcripts where video_id in (select id from videos where owner_id = p_user);
  delete from likes where actor_id = p_user;
  delete from notifications where user_id = p_user;
  delete from level_history where user_id = p_user;

  update comments set actor_id = null where actor_id = p_user;

  update videos
  set owner_id = null, title = null, url = null, url_key = 'withdrawn:' || id::text, thumbnail_url = null,
      status = 'withdrawn'
  where owner_id = p_user;

  delete from auth.users where id = p_user; -- profiles는 CASCADE로 함께 삭제(BR-002)
end;
$$;
