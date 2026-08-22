-- 스토리룸 홍보 블로그 게시물 등록 기능. 영상 등록과 동일한 패턴으로
-- 회원이 URL/제목을 등록하면 관리자 승인(pending → active/rejected)을 거친다.

create table if not exists blog_posts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references profiles(id) on delete set null,
  title       text,
  url         text not null,
  url_key     text not null unique,
  status      text not null default 'pending' check (status in ('active','pending','rejected','deleted','withdrawn')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_blog_posts_owner on blog_posts(owner_id);
create index if not exists idx_blog_posts_status on blog_posts(status);
create index if not exists idx_blog_posts_created_at on blog_posts(created_at desc);

drop trigger if exists trg_blog_posts_set_updated_at on blog_posts;
create trigger trg_blog_posts_set_updated_at
before update on blog_posts
for each row execute function set_updated_at();

alter table blog_posts enable row level security;

drop policy if exists blog_posts_select on blog_posts;
drop policy if exists blog_posts_insert on blog_posts;
drop policy if exists blog_posts_update on blog_posts;

create policy blog_posts_select on blog_posts for select to authenticated using (true);
create policy blog_posts_insert on blog_posts for insert to authenticated
  with check (owner_id = auth.uid() and is_approved());
create policy blog_posts_update on blog_posts for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 탈퇴 시 영상과 동일하게 블로그 게시물도 식별정보를 비우고 withdrawn 처리한다.
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

  update blog_posts
  set owner_id = null, title = null, url = null, url_key = 'withdrawn:' || id::text,
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
