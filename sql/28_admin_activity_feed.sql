-- 회원 활동 통합 피드(로그인 + 영상 등록 + 댓글 + 좋아요)를 시간순으로 모아
-- 보여준다. 최고관리자 전용. p_before로 커서 기반 페이지네이션한다.

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
  ) feed
  where (p_user is null or feed.user_id = p_user)
    and (p_before is null or feed.created_at < p_before)
  order by feed.created_at desc
  limit p_limit;
exception when others then
  return;
end;
$$;

revoke execute on function admin_activity_feed(integer, timestamptz, uuid) from public, anon;
grant execute on function admin_activity_feed(integer, timestamptz, uuid) to authenticated;
