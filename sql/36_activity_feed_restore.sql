-- sql/35에서 추가한 "회원탈퇴" 집계 쿼리가 admin_activity_feed() 안에서
-- 런타임 오류를 일으켜(예외가 함수 전체를 감싸는 exception when others로
-- 조용히 삼켜짐) 로그인/영상/댓글/좋아요 등 기존에 정상 표시되던 기록까지
-- 전부 빈 화면으로 보이게 만들었다. 기존 회원 데이터는 전혀 삭제되지
-- 않았고(row count 확인 완료), 화면에 보여주는 피드 함수만 깨졌던 것이다.
--
-- 우선 안전하게 검증된 구성(로그인/영상/댓글/좋아요/회원가입)으로 즉시
-- 복구한다. 회원탈퇴 집계는 원인을 더 정확히 확인한 뒤 별도로 다시 추가한다.

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
  ) feed
  where (p_user is null or feed.user_id = p_user)
    and (p_before is null or feed.created_at < p_before)
  order by feed.created_at desc
  limit p_limit;
exception when others then
  return;
end;
$$;
