-- 회원 활동 피드(admin_activity_feed)에 회원가입/회원탈퇴 기록을 추가한다.
--
-- 가입: profiles.created_at은 모든 회원(과거 포함)에 그대로 남아있으므로
-- 별도 백필 없이 즉시 과거 기록까지 표시된다.
--
-- 탈퇴: 본인 탈퇴(withdraw_user)는 profiles 행 자체를 삭제하기 때문에,
-- 이 마이그레이션 이전에 이미 탈퇴한 회원은 원본 데이터가 남아있지 않아
-- 피드에 표시할 수 없다. 이 마이그레이션 이후의 탈퇴부터는 삭제 직전에
-- audit_log에 표시 이름/이메일 스냅샷을 남기도록 withdraw_user()를 함께
-- 수정해 피드에 표시되도록 한다. 관리자가 회원 상태를 직접 withdrawn으로
-- 바꾼 경우(update_member_info)는 profiles 행이 남아있으므로 과거 기록도
-- audit_log가 남아있는 한 표시된다.

create or replace function withdraw_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
begin
  select display_name, email into prof from profiles where id = p_user;

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

  insert into audit_log (admin_id, action, target_table, target_id, before, after)
  values (
    null, 'withdraw_user', 'profiles', p_user::text,
    jsonb_build_object('display_name', prof.display_name, 'email', prof.email),
    null
  );

  delete from auth.users where id = p_user; -- profiles는 CASCADE로 함께 삭제(BR-002)
end;
$$;

create or replace function admin_activity_feed(p_limit integer default 50, p_before timestamptz default null, p_user uuid default null)
returns table(activity_type text, user_id uuid, display_name text, email text, created_at timestamptz, detail text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'super_admin') then
    raise exception '권한이 없습니다';
  end if;

  return query
  select feed.activity_type, feed.user_id, feed.display_name, feed.email, feed.created_at, feed.detail
  from (
    select 'login'::text as activity_type, p.id as user_id, p.display_name, p.email,
           lh.logged_in_at as created_at, lh.ip_address as detail
    from login_history lh
    join profiles p on p.id = lh.user_id
    union all
    select 'video', p.id, p.display_name, p.email, v.created_at, coalesce(v.title, initcap(v.platform))
    from videos v
    join profiles p on p.id = v.owner_id
    where v.owner_id is not null
    union all
    select 'comment', p.id, p.display_name, p.email, c.created_at, c.content
    from comments c
    join profiles p on p.id = c.actor_id
    where c.actor_id is not null
    union all
    select 'like', p.id, p.display_name, p.email, l.created_at, null::text
    from likes l
    join profiles p on p.id = l.actor_id
    union all
    select 'signup', p.id, p.display_name, p.email, p.created_at, null::text
    from profiles p
    union all
    select 'withdrawal', wd.tid, coalesce(p.display_name, wd.before->>'display_name'),
           coalesce(p.email, wd.before->>'email'), wd.created_at, null::text
    from (
      select target_id::uuid as tid, before, created_at
      from audit_log
      where target_table = 'profiles'
        and (
          action = 'withdraw_user'
          or (
            action = 'update_member_info'
            and (after->>'status') = 'withdrawn'
            and coalesce(before->>'status', '') is distinct from 'withdrawn'
          )
        )
    ) wd
    left join profiles p on p.id = wd.tid
  ) feed
  where (p_user is null or feed.user_id = p_user)
    and (p_before is null or feed.created_at < p_before)
  order by feed.created_at desc
  limit p_limit;
exception when others then
  return;
end;
$$;
