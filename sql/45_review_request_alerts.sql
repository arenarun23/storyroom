-- 유튜브 영상/블로그 게시물이 승인 대기(pending)로 새로 등록되면 관리자에게
-- 알림을 보내고, 어떤 관리자가 승인/거절했는지 기록한다.

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('promotion','demotion','expiry_warning','ai_comment','approval','review_request'));

alter table videos add column if not exists reviewed_by uuid references profiles(id) on delete set null;
alter table videos add column if not exists reviewed_at timestamptz;

alter table blog_posts add column if not exists reviewed_by uuid references profiles(id) on delete set null;
alter table blog_posts add column if not exists reviewed_at timestamptz;

create or replace function trg_video_review_alert_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    insert into notifications (user_id, type, title, body)
    select p.id, 'review_request', '유튜브 영상 승인 요청',
           coalesce(new.title, '제목 없음') || ' 영상이 승인 대기 중입니다.'
    from profiles p
    where p.role in ('admin', 'super_admin') and p.status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_video_review_alert on videos;
create trigger trg_video_review_alert
after insert on videos
for each row execute function trg_video_review_alert_fn();

create or replace function trg_blog_post_review_alert_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    insert into notifications (user_id, type, title, body)
    select p.id, 'review_request', '블로그 게시물 승인 요청',
           coalesce(new.title, '제목 없음') || ' 게시물이 승인 대기 중입니다.'
    from profiles p
    where p.role in ('admin', 'super_admin') and p.status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_blog_post_review_alert on blog_posts;
create trigger trg_blog_post_review_alert
after insert on blog_posts
for each row execute function trg_blog_post_review_alert_fn();
