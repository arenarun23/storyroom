-- 보안 점검 발견 사항(Medium 3건): RLS는 "본인 행"까지만 좁혀 주고 컬럼은
-- 구분하지 않아서, 회원이 공개 anon 키 + 본인 세션으로 PostgREST를 직접 호출하면
-- 관리자 전용 컬럼까지 고칠 수 있었다.
--   1) profiles : status(정지 해제), manual_override(강등 회피),
--                 yt_channel_id/yt_verified_at(유튜브 인증 위조) 등
--   2) videos   : 관리자가 반려/초기화/삭제한 영상을 다시 active로, 검토·지표 컬럼 조작
--   3) blog_posts: status='active'로 직접 등록/수정해 마스터 승급 조건을 자가 충족
--
-- 해결: 기존 trg_guard_profile과 같은 패턴(BEFORE 트리거)으로 "신뢰된 쓰기"가
-- 아니면 보호 컬럼 변경을 막는다. 신뢰된 쓰기 = service role(관리자 서버 액션,
-- SQL 콘솔, cron) 또는 app.internal_write='on'(승급 판정 등 내부 함수).
-- 회원 화면이 실제로 쓰는 경로(영상 등록/수정/삭제, 블로그 등록/삭제, 온보딩 정보
-- 입력)는 그대로 동작한다.
--
-- last_active_at은 좋아요/댓글/영상 트리거가 회원 세션에서 갱신하므로 보호 대상에서
-- 제외했다(표시용 값이라 영향이 작다).

-- 공통: 신뢰된 쓰기 여부. 기존 트리거들이 인라인으로 쓰던 조건과 동일하다.
create or replace function is_trusted_write() returns boolean
language sql stable set search_path = public as $$
  select coalesce(auth.role(), 'service_role') = 'service_role'
      or coalesce(current_setting('app.internal_write', true), 'off') = 'on';
$$;

------------------------------------------------------------------------------
-- 1) profiles: 보호 컬럼 목록 확장
------------------------------------------------------------------------------
create or replace function trg_guard_profile_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (
    new.id is distinct from old.id
    or new.current_level is distinct from old.current_level
    or new.approval_status is distinct from old.approval_status
    or new.role is distinct from old.role
    or new.level_expires_at is distinct from old.level_expires_at
    or new.promotion_locked_until is distinct from old.promotion_locked_until
    -- 여기부터 추가된 보호 컬럼
    or new.status is distinct from old.status
    or new.manual_override is distinct from old.manual_override
    or new.level_updated_at is distinct from old.level_updated_at
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.yt_channel_id is distinct from old.yt_channel_id
    or new.yt_verify_code is distinct from old.yt_verify_code
    or new.yt_verified_at is distinct from old.yt_verified_at
    or new.email is distinct from old.email
    or new.auth_provider is distinct from old.auth_provider
    or new.created_at is distinct from old.created_at
  ) then
    if not is_trusted_write() then
      raise exception '보호된 컬럼은 직접 수정할 수 없습니다.';
    end if;
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 2) videos: 회원은 내용(제목/링크/재생시간/닉네임)만 고치고, 상태는 '삭제'로만
------------------------------------------------------------------------------
create or replace function trg_guard_video_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_trusted_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 회원이 직접 넣을 수 있는 상태는 등록 직후 상태뿐이다. 유튜브 영상은
    -- 이어서 실행되는 trg_validate_video가 인증 여부에 따라 pending으로 내린다.
    if new.status not in ('active', 'pending') then
      raise exception '보호된 컬럼은 직접 수정할 수 없습니다.';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.reassigned_to_id := null;
    new.is_flagged := false; -- 필요하면 trg_validate_video가 다시 켠다
    new.yt_channel_id := null; -- 앱은 등록 시 채널 ID를 보내지 않는다(인증 우회 방지)
    new.yt_views := 0;
    new.yt_likes := 0;
    new.yt_comments := 0;
    new.yt_synced_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE: 상태는 내 목록에 보이는 영상(active/pending/rejected)을 '삭제'로
  -- 바꾸는 것만 허용한다(내 정보 화면의 삭제 버튼). 되살리기는 관리자만 가능.
  if new.status is distinct from old.status
     and not (old.status in ('active', 'pending', 'rejected') and new.status = 'deleted') then
    raise exception '보호된 컬럼은 직접 수정할 수 없습니다.';
  end if;

  if (
    new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.reassigned_to_id is distinct from old.reassigned_to_id
    or new.is_flagged is distinct from old.is_flagged
    or new.yt_channel_id is distinct from old.yt_channel_id
    or new.yt_views is distinct from old.yt_views
    or new.yt_likes is distinct from old.yt_likes
    or new.yt_comments is distinct from old.yt_comments
    or new.yt_synced_at is distinct from old.yt_synced_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception '보호된 컬럼은 직접 수정할 수 없습니다.';
  end if;

  return new;
end;
$$;

-- BEFORE 트리거는 이름순으로 실행된다. trg_guard_video < trg_validate_video 이므로
-- 회원이 보낸 값을 먼저 검사한 뒤, trg_validate_video가 status/is_flagged를
-- 조정(유튜브 pending 전환, 이상치 플래그)하는 순서가 된다.
drop trigger if exists trg_guard_video on videos;
create trigger trg_guard_video
before insert or update on videos
for each row execute function trg_guard_video_fn();

-- 정지/미승인 회원은 영상을 수정할 수 없게 한다(등록 정책과 동일한 조건).
drop policy if exists videos_update on videos;
create policy videos_update on videos for update to authenticated
  using (owner_id = auth.uid() and is_approved())
  with check (owner_id = auth.uid() and is_approved());

------------------------------------------------------------------------------
-- 3) blog_posts: 등록은 항상 pending, 회원이 바꿀 수 있는 상태는 '삭제'뿐
------------------------------------------------------------------------------
create or replace function trg_guard_blog_post_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_trusted_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status
     and not (old.status in ('active', 'pending', 'rejected') and new.status = 'deleted') then
    raise exception '보호된 컬럼은 직접 수정할 수 없습니다.';
  end if;

  -- 승인받은 뒤 링크를 바꿔치기하지 못하도록 url/url_key도 고정한다
  -- (회원 화면에는 블로그 게시물 수정 기능이 없고 등록/삭제만 있다).
  if (
    new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.url is distinct from old.url
    or new.url_key is distinct from old.url_key
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception '보호된 컬럼은 직접 수정할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_blog_post on blog_posts;
create trigger trg_guard_blog_post
before insert or update on blog_posts
for each row execute function trg_guard_blog_post_fn();

drop policy if exists blog_posts_update on blog_posts;
create policy blog_posts_update on blog_posts for update to authenticated
  using (owner_id = auth.uid() and is_approved())
  with check (owner_id = auth.uid() and is_approved());

------------------------------------------------------------------------------
-- 적용 후 점검용 쿼리(수동 실행). 이 패치는 앞으로의 조작만 막고, 이미 조작된
-- 행은 되돌리지 않는다. 아래 결과에 행이 있으면 관리자 검토가 필요하다.
------------------------------------------------------------------------------
-- (a) 관리자 검토 기록 없이 active인 블로그 게시물
--   select id, owner_id, url, created_at from blog_posts
--   where status = 'active' and reviewed_by is null;
--
-- (b) 감사 로그에 근거가 없는 manual_override
--   select p.id, p.display_name from profiles p
--   where p.manual_override
--     and not exists (select 1 from audit_log a
--                     where a.target_table = 'profiles' and a.target_id = p.id::text);
--
-- (c) 인증 시각은 있는데 채널 ID가 없거나, 관리자 반려 로그가 있는데 active인 영상
--   select id, display_name from profiles
--   where yt_verified_at is not null and yt_channel_id is null;
--   select v.id, v.owner_id, v.url from videos v
--   where v.status = 'active'
--     and (select a.action from audit_log a
--          where a.target_table = 'videos' and a.target_id = v.id::text
--          order by a.created_at desc limit 1) in ('reject_video', 'delete_video');
