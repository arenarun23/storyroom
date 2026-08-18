-- =====================================================================
-- 스토리룸 교사 그룹 — DB 스키마
-- 시방서 v2.0 §6(데이터 명세) §7(처리 로직) §8.3(RLS) §11.3~11.4 기준
--
-- 실행 순서: 01_schema.sql → 02_promotion_cooldown.sql → 03_video_feed.sql
-- 이 파일은 재실행에 안전하다(0번 섹션이 기존 객체를 모두 지우고 새로 만든다).
-- 실행 전에 있던 데이터(가입한 회원 프로필, 등록 영상 등)는 전부 삭제되니
-- 재실행 후에는 다시 로그인해서 프로필을 만들고, 필요하면 관리자 승격
-- SQL도 다시 실행해야 한다. Supabase Auth 계정(로그인 자체)은 영향받지 않는다.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 설계 판단 메모 (시방서에 명시되지 않아 구현 시 확정한 사항)
-- 1) FR-210 "삭제된 영상도 지표는 유지된다"는 "타인이 남긴 좋아요·댓글 기록이
--    보존된다"는 뜻으로 해석했다. 승급·유지 판정에 쓰이는 본인의 video_count /
--    total_duration_min은 status='active' 영상만 집계한다(삭제 영상 제외).
--    FR-907(탈퇴 시 영상 껍데기 유지)과 동일한 패턴이다.
-- 2) §8.3 RLS 매트릭스는 videos/likes/comments/ai_feedbacks/video_transcripts의
--    생성·수정 주체에 "admin"을 포함하지만, §3.7 FR-608·FR-708·NFR-206은 관리자를
--    열람 전용으로 못박는다. 두 기술이 상충하여 더 구체적인 FR을 따라 관리자에게는
--    콘텐츠 테이블에 대한 앱 레벨 쓰기 RLS를 부여하지 않았다(단, FR-306 댓글 숨김
--    기능만 별도 허용). 전체 데이터에 대한 관리 작업은 service role로 수행한다.
-- ---------------------------------------------------------------------

-- =====================================================================
-- 0. 초기화 — 이 파일이 만드는 객체를 전부 지운다 (재실행 안전성 확보)
-- =====================================================================

drop table if exists audit_log cascade;
drop table if exists login_history cascade;
drop table if exists notifications cascade;
drop table if exists level_history cascade;
drop table if exists level_rules cascade;
drop table if exists ai_feedbacks cascade;
drop table if exists video_transcripts cascade;
drop table if exists comments cascade;
drop table if exists likes cascade;
drop table if exists videos cascade;
drop table if exists profiles cascade;
drop table if exists levels cascade;
drop table if exists app_config cascade;

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists list_videos_feed(text, text, bigint, timestamptz, uuid, integer) cascade;
drop function if exists admin_reassign_video(uuid, uuid, uuid) cascade;
drop function if exists admin_reset_video(uuid, uuid) cascade;
drop function if exists release_cooldown_early(uuid, uuid) cascade;
drop function if exists public_stats() cascade;
drop function if exists ensure_profile() cascade;
drop function if exists my_metrics(timestamptz) cascade;
drop function if exists withdraw_user(uuid) cascade;
drop function if exists run_expiry_warnings() cascade;
drop function if exists run_cooldown_release() cascade;
drop function if exists run_retention_check() cascade;
drop function if exists apply_promotion(uuid) cascade;
drop function if exists apply_reevaluation(uuid) cascade;
drop function if exists apply_level(uuid, text, text, text, uuid) cascade;
drop function if exists evaluate_level(uuid) cascade;
drop function if exists check_rules(uuid, text, text, timestamptz) cascade;
drop function if exists get_user_metrics(uuid, timestamptz) cascade;
drop function if exists set_updated_at() cascade;
drop function if exists is_approved(uuid) cascade;
drop function if exists is_admin(uuid) cascade;
drop function if exists cfg_int(text) cascade;
drop function if exists cfg_text(text) cascade;
drop function if exists handle_new_user() cascade;
drop function if exists trg_guard_profile_fn() cascade;
drop function if exists trg_block_self_like_fn() cascade;
drop function if exists trg_validate_video_fn() cascade;
drop function if exists trg_validate_comment_fn() cascade;
drop function if exists trg_eval_video_fn() cascade;

drop type if exists user_metrics cascade;

-- =====================================================================
-- 1. 테이블
-- =====================================================================

create table app_config (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz not null default now()
);

create table levels (
  code            text primary key,
  order_no        integer not null unique,
  name            text not null,
  description     text,
  benefits        text,
  badge_color     text, -- "fromHex,toHex" 그라디언트
  badge_image_url text,
  has_retention   boolean not null default true,
  is_active       boolean not null default true,
  updated_at      timestamptz not null default now()
);

create table profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text not null unique,
  display_name           text,
  avatar_url             text,
  role                   text not null default 'user' check (role in ('user','admin')),
  auth_provider          text not null default 'google' check (auth_provider in ('google','email')),
  approval_status        text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  approved_at            timestamptz,
  approved_by            uuid references profiles(id),
  current_level          text not null default 'L0' references levels(code),
  level_updated_at       timestamptz not null default now(),
  level_expires_at       timestamptz,
  promotion_locked_until timestamptz,
  manual_override        boolean not null default false,
  status                 text not null default 'active' check (status in ('active','suspended','withdrawn')),
  yt_channel_id          text,
  yt_verify_code         text unique,
  yt_verified_at         timestamptz,
  last_active_at         timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

create table videos (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references profiles(id) on delete set null,
  platform        text not null check (platform in ('storyroom','youtube')),
  title           text,
  url             text,
  url_key         text not null unique,
  duration_sec    integer not null check (duration_sec > 0),
  duration_source text not null default 'auto' check (duration_source in ('auto','manual','api')),
  thumbnail_url   text,
  yt_video_id     text,
  yt_channel_id   text,
  yt_views        bigint not null default 0,
  yt_likes        bigint not null default 0,
  yt_comments     bigint not null default 0,
  yt_synced_at    timestamptz,
  is_flagged      boolean not null default false,
  status          text not null default 'active' check (status in ('active','rejected','deleted','withdrawn','reset')),
  reassigned_to_id uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_videos_owner on videos(owner_id);
create index idx_videos_status on videos(status);
create index idx_videos_platform on videos(platform);
create index idx_videos_created_at on videos(created_at desc);

create table likes (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references videos(id) on delete cascade,
  actor_id   uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (video_id, actor_id)
);

create index idx_likes_video on likes(video_id);
create index idx_likes_actor on likes(actor_id);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references videos(id) on delete cascade,
  actor_id   uuid references profiles(id) on delete set null,
  content    text not null,
  status     text not null default 'active' check (status in ('active','hidden')),
  created_at timestamptz not null default now()
);

create index idx_comments_video on comments(video_id);
create index idx_comments_actor on comments(actor_id);

create table video_transcripts (
  video_id   uuid primary key references videos(id) on delete cascade,
  language   text,
  content    text,
  fetched_at timestamptz not null default now()
);

create table ai_feedbacks (
  id           uuid primary key default gen_random_uuid(),
  video_id     uuid not null unique references videos(id) on delete cascade,
  summary      text,
  strengths    text,
  improvements text,
  mode         text not null check (mode in ('full','meta_only')),
  status       text not null default 'visible' check (status in ('visible','hidden')),
  created_at   timestamptz not null default now()
);

create table level_rules (
  id            uuid primary key default gen_random_uuid(),
  target_level  text not null references levels(code),
  rule_type     text not null check (rule_type in ('promotion','retention')),
  metric_key    text not null,
  operator      text not null check (operator in ('>=','>','<=','<','=')),
  threshold     numeric not null,
  is_active     boolean not null default true,
  memo          text,
  -- FR-407: 좋아요·댓글은 기준으로 선택 불가. 기간(retention) 규칙은 기간 집계가
  -- 가능한 지표만 허용(§6.3 "기간" 열이 "—"인 yt_views/yt_likes/yt_comments 제외)
  constraint level_rules_metric_check check (
    metric_key in ('video_count','total_duration_min','yt_video_count','yt_views','yt_likes','yt_comments')
    and (
      rule_type = 'promotion'
      or (rule_type = 'retention' and metric_key in ('video_count','total_duration_min','yt_video_count'))
    )
  )
);

create index idx_level_rules_lookup on level_rules(target_level, rule_type, is_active);

create table level_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  from_level         text,
  to_level           text not null,
  level_name_snapshot text not null,
  change_type        text not null check (change_type in ('promotion','retention_demotion','manual','cooldown_release')),
  reason             text,
  actor_id           uuid references profiles(id),
  metrics_snapshot   jsonb,
  created_at         timestamptz not null default now()
);

create index idx_level_history_user on level_history(user_id, created_at desc);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null check (type in ('promotion','demotion','expiry_warning','ai_comment','approval')),
  title      text not null,
  body       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id, is_read, created_at desc);

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references profiles(id),
  action      text not null,
  target_table text,
  target_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index idx_audit_log_created_at on audit_log(created_at desc);

-- 회원별 로그인 기록. 구글 로그인(/auth/callback)·관리자 로그인 성공 시 기록된다.
create table login_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  ip_address  text,
  user_agent  text
);

create index idx_login_history_user on login_history(user_id, logged_in_at desc);

-- =====================================================================
-- 2. 공통 함수 (§11.3)
-- =====================================================================

create function cfg_text(p_key text) returns text
language sql stable security definer set search_path = public as $$
  select value from app_config where key = p_key;
$$;

create function cfg_int(p_key text) returns integer
language sql stable security definer set search_path = public as $$
  select value::integer from app_config where key = p_key;
$$;

create function is_admin(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and role = 'admin');
$$;

create function is_approved(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = p_user and approval_status = 'approved' and status = 'active'
  );
$$;

create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create type user_metrics as (
  video_count         integer,
  total_duration_min  numeric,
  yt_video_count      integer,
  yt_views            bigint,
  yt_likes            bigint,
  yt_comments         bigint,
  received_likes      integer,
  received_comments   integer,
  given_likes         integer,
  given_comments      integer
);

-- 누적(p_since=null) 또는 최근 기간(p_since 이후 등록분) 지표 계산.
-- yt_views/yt_likes/yt_comments는 채널 스냅샷 값이라 기간 집계를 지원하지
-- 않으므로 p_since와 무관하게 항상 누적값을 반환한다(§6.3).
create function get_user_metrics(p_user uuid, p_since timestamptz default null)
returns user_metrics
language plpgsql stable security definer set search_path = public as $$
declare
  result user_metrics;
begin
  select
    count(*) filter (where platform = 'storyroom' and (p_since is null or created_at >= p_since)),
    coalesce(sum(duration_sec) filter (where platform = 'storyroom' and (p_since is null or created_at >= p_since)), 0) / 60.0,
    count(*) filter (where platform = 'youtube' and (p_since is null or created_at >= p_since)),
    coalesce(sum(yt_views) filter (where platform = 'youtube'), 0),
    coalesce(sum(yt_likes) filter (where platform = 'youtube'), 0),
    coalesce(sum(yt_comments) filter (where platform = 'youtube'), 0)
  into
    result.video_count, result.total_duration_min, result.yt_video_count,
    result.yt_views, result.yt_likes, result.yt_comments
  from videos
  where owner_id = p_user and status = 'active';

  select count(*) into result.received_likes
  from likes l join videos v on v.id = l.video_id
  where v.owner_id = p_user;

  select count(*) into result.received_comments
  from comments c join videos v on v.id = c.video_id
  where v.owner_id = p_user and c.status = 'active';

  select count(*) into result.given_likes from likes where actor_id = p_user;

  select count(*) into result.given_comments
  from comments where actor_id = p_user and status = 'active';

  return result;
end;
$$;

create function check_rules(p_user uuid, p_level text, p_rule_type text, p_since timestamptz)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  rule record;
  metrics user_metrics;
  metric_value numeric;
begin
  metrics := get_user_metrics(p_user, p_since);

  for rule in
    select * from level_rules
    where target_level = p_level and rule_type = p_rule_type and is_active = true
  loop
    metric_value := case rule.metric_key
      when 'video_count' then metrics.video_count
      when 'total_duration_min' then metrics.total_duration_min
      when 'yt_video_count' then metrics.yt_video_count
      when 'yt_views' then metrics.yt_views
      when 'yt_likes' then metrics.yt_likes
      when 'yt_comments' then metrics.yt_comments
      else null
    end;

    if not (
      case rule.operator
        when '>=' then metric_value >= rule.threshold
        when '>'  then metric_value >  rule.threshold
        when '<=' then metric_value <= rule.threshold
        when '<'  then metric_value <  rule.threshold
        when '='  then metric_value =  rule.threshold
        else false
      end
    ) then
      return false;
    end if;
  end loop;

  return true; -- 규칙이 없으면 통과
end;
$$;

-- §7.1: 누적 승급 기준과 최근 기간 유지 기준을 함께 충족해야 도달 가능
-- (BR-001: 강등된 회원이 누적값만으로 즉시 복귀하는 것을 방지)
create function evaluate_level(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  lvl record;
  months integer;
  since timestamptz;
begin
  months := coalesce(cfg_int('retention_months'), 6);
  since := now() - (months || ' months')::interval;

  for lvl in
    select code from levels where order_no > 0 and is_active = true order by order_no desc
  loop
    if check_rules(p_user, lvl.code, 'promotion', null)
       and check_rules(p_user, lvl.code, 'retention', since) then
      return lvl.code;
    end if;
  end loop;

  return 'L0';
end;
$$;

-- §7.5: 등급 변경 적용 + 이력 기록 + 알림 생성
create function apply_level(
  p_user uuid, p_to_level text, p_reason text, p_change_type text, p_actor uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur_level text;
  cur_order integer;
  to_order integer;
  to_has_retention boolean;
  to_name text;
  retention_months integer;
  cooldown_months integer;
  new_expires timestamptz;
  new_lock timestamptz;
  metrics jsonb;
begin
  select current_level into cur_level from profiles where id = p_user for update;
  if cur_level is null or cur_level = p_to_level then
    return;
  end if;

  select order_no into cur_order from levels where code = cur_level;
  select order_no, has_retention, name into to_order, to_has_retention, to_name
  from levels where code = p_to_level;

  retention_months := coalesce(cfg_int('retention_months'), 6);
  cooldown_months := coalesce(cfg_int('promotion_cooldown_months'), 1);

  new_expires := case when to_has_retention then now() + (retention_months || ' months')::interval else null end;
  new_lock := case when to_order < cur_order then now() + (cooldown_months || ' months')::interval else null end;

  perform set_config('app.internal_write', 'on', true);

  update profiles
  set current_level = p_to_level,
      level_updated_at = now(),
      level_expires_at = new_expires,
      promotion_locked_until = new_lock
  where id = p_user;

  select to_jsonb(get_user_metrics(p_user, null)) into metrics;

  insert into level_history (user_id, from_level, to_level, level_name_snapshot, change_type, reason, actor_id, metrics_snapshot)
  values (p_user, cur_level, p_to_level, to_name, p_change_type, p_reason, p_actor, metrics);

  insert into notifications (user_id, type, title, body)
  values (
    p_user,
    case when to_order > cur_order then 'promotion' else 'demotion' end,
    case when to_order > cur_order then to_name || ' 등급으로 승급했습니다' else to_name || ' 등급으로 하락했습니다' end,
    case when new_lock is not null then '복귀 심사는 ' || to_char(new_lock, 'YYYY-MM-DD') || '부터 진행됩니다.' else null end
  );
end;
$$;

-- §7.2: 승급 판정 (수동조정/미승인/정지/유예 중이면 보류)
create function apply_promotion(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  next_level text;
  cur_order integer;
  next_order integer;
  retention_months integer;
  cur_has_retention boolean;
begin
  select * into prof from profiles where id = p_user;
  if prof is null then return; end if;

  if prof.manual_override
     or prof.approval_status <> 'approved'
     or prof.status <> 'active' then
    return;
  end if;

  if prof.promotion_locked_until is not null and prof.promotion_locked_until > now() then
    return; -- 복귀 유예 중: 판정 보류, 지표는 계속 누적됨(BR-007)
  end if;

  next_level := evaluate_level(p_user);
  select order_no into cur_order from levels where code = prof.current_level;
  select order_no into next_order from levels where code = next_level;

  if next_order > cur_order then
    perform apply_level(p_user, next_level, '승급 기준 충족', 'promotion', null);
  elsif next_order = cur_order then
    select has_retention into cur_has_retention from levels where code = prof.current_level;
    if cur_has_retention then
      retention_months := coalesce(cfg_int('retention_months'), 6);
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = now() + (retention_months || ' months')::interval
      where id = p_user;
    end if;
  end if;
end;
$$;

-- 관리자가 등급 기준을 바꾼 뒤 전체 재판정할 때 사용. apply_promotion과 달리
-- 새 기준에 못 미치면 즉시 강등까지 반영한다(평소 영상 등록 흐름은 여전히
-- apply_promotion을 써서 즉시 강등 없이 유지 만료일 도달 시에만 강등한다).
create function apply_reevaluation(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  next_level text;
  cur_order integer;
  next_order integer;
  retention_months integer;
  cur_has_retention boolean;
begin
  select * into prof from profiles where id = p_user;
  if prof is null then return; end if;

  if prof.manual_override
     or prof.approval_status <> 'approved'
     or prof.status <> 'active' then
    return;
  end if;

  next_level := evaluate_level(p_user);
  select order_no into cur_order from levels where code = prof.current_level;
  select order_no into next_order from levels where code = next_level;

  if next_order < cur_order then
    perform apply_level(p_user, next_level, '기준 변경으로 인한 재판정', 'retention_demotion', null);
    return;
  end if;

  if prof.promotion_locked_until is not null and prof.promotion_locked_until > now() then
    return; -- 승급 잠금(복귀 유예) 중에는 승급·유지 갱신을 보류한다
  end if;

  if next_order > cur_order then
    perform apply_level(p_user, next_level, '승급 기준 충족', 'promotion', null);
  elsif next_order = cur_order then
    select has_retention into cur_has_retention from levels where code = prof.current_level;
    if cur_has_retention then
      retention_months := coalesce(cfg_int('retention_months'), 6);
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = now() + (retention_months || ' months')::interval
      where id = p_user;
    end if;
  end if;
end;
$$;

revoke execute on function apply_reevaluation(uuid) from public, anon, authenticated;

-- §7.3: 유지 심사 및 강등 (매일 배치)
create function run_retention_check() returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  retention_months integer;
  since timestamptz;
  lower_level text;
begin
  retention_months := coalesce(cfg_int('retention_months'), 6);
  since := now() - (retention_months || ' months')::interval;

  for prof in
    select p.* from profiles p
    join levels l on l.code = p.current_level
    where p.level_expires_at <= now()
      and p.manual_override = false
      and p.status = 'active'
      and l.has_retention = true
  loop
    if check_rules(prof.id, prof.current_level, 'retention', since) then
      perform set_config('app.internal_write', 'on', true);
      update profiles set level_expires_at = now() + (retention_months || ' months')::interval
      where id = prof.id;
    else
      select code into lower_level from levels
      where order_no = (select order_no from levels where code = prof.current_level) - 1;
      perform apply_level(prof.id, coalesce(lower_level, 'L0'), '유지 기준 미충족', 'retention_demotion', null);
    end if;
  end loop;
end;
$$;

-- §7.4: 복귀 유예 종료자 재판정 (강등 처리 이후 실행)
create function run_cooldown_release() returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
begin
  for prof in
    select * from profiles
    where promotion_locked_until is not null and promotion_locked_until <= now()
  loop
    perform set_config('app.internal_write', 'on', true);
    update profiles set promotion_locked_until = null where id = prof.id;
    perform apply_promotion(prof.id);
  end loop;
end;
$$;

-- 만료 임박 알림 (FR-415, FR-803: 7일 내 중복 발송 금지)
create function run_expiry_warnings() returns void
language plpgsql security definer set search_path = public as $$
declare
  prof record;
  warn_days integer;
begin
  warn_days := coalesce(cfg_int('retention_warning_days'), 30);

  for prof in
    select p.* from profiles p
    join levels l on l.code = p.current_level
    where l.has_retention = true
      and p.level_expires_at is not null
      and p.level_expires_at <= now() + (warn_days || ' days')::interval
      and p.level_expires_at > now()
      and p.status = 'active'
      and not exists (
        select 1 from notifications n
        where n.user_id = p.id and n.type = 'expiry_warning'
          and n.created_at > now() - interval '7 days'
      )
  loop
    insert into notifications (user_id, type, title, body)
    values (
      prof.id, 'expiry_warning', '등급 유지 기준 만료 임박',
      to_char(prof.level_expires_at, 'YYYY-MM-DD') || '까지 유지 기준을 충족하지 못하면 등급이 하락합니다.'
    );
  end loop;
end;
$$;

-- §7.7: 회원 탈퇴 (단일 트랜잭션)
create function withdraw_user(p_user uuid) returns void
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

-- 로그인한 본인의 지표만 반환하는 안전한 래퍼 (내 정보 페이지 §4.3에서 사용)
create function my_metrics(p_since timestamptz default null)
returns user_metrics
language sql stable security definer set search_path = public as $$
  select * from get_user_metrics(auth.uid(), p_since);
$$;

grant execute on function my_metrics(timestamptz) to authenticated;

-- 로그인 세션은 있는데 profiles 행이 없는 경우(예: 스키마 재구성으로 profiles만
-- 초기화됐지만 auth.users 세션은 유지된 경우) 본인 프로필을 스스로 채워 넣는
-- 자가복구 함수. handle_new_user()와 동일한 로직을 auth.uid() 기준으로 수행한다.
create function ensure_profile() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mode text;
  init_status text;
  u record;
begin
  if uid is null or exists (select 1 from profiles where id = uid) then
    return;
  end if;

  select email, raw_user_meta_data, raw_app_meta_data into u from auth.users where id = uid;
  if u is null then
    return;
  end if;

  mode := coalesce(cfg_text('signup_approval_mode'), 'auto');
  init_status := case when mode = 'auto' then 'approved' else 'pending' end;

  insert into profiles (
    id, email, display_name, avatar_url, role, auth_provider,
    approval_status, approved_at, current_level, yt_verify_code
  ) values (
    uid,
    u.email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
    u.raw_user_meta_data->>'avatar_url',
    'user',
    coalesce(u.raw_app_meta_data->>'provider', 'email'),
    init_status,
    case when init_status = 'approved' then now() else null end,
    'L0',
    'SR-VERIFY-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
  )
  on conflict (id) do nothing;
end;
$$;

grant execute on function ensure_profile() to authenticated;

-- 판정·배치·탈퇴 함수는 SECURITY DEFINER이며 인자로 임의의 사용자 uuid를 받으므로
-- PostgREST RPC로 그대로 노출하면 다른 회원의 지표 조회·등급 조작이 가능해진다.
-- authenticated/anon의 직접 호출을 막고 service role(관리자 서버 액션·Cron)에서만
-- 사용한다. 트리거·함수 내부의 중첩 호출은 정의자 권한으로 실행되므로 영향 없다.
revoke execute on function get_user_metrics(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function check_rules(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function evaluate_level(uuid) from public, anon, authenticated;
revoke execute on function apply_level(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function apply_promotion(uuid) from public, anon, authenticated;
revoke execute on function run_retention_check() from public, anon, authenticated;
revoke execute on function run_cooldown_release() from public, anon, authenticated;
revoke execute on function run_expiry_warnings() from public, anon, authenticated;
revoke execute on function withdraw_user(uuid) from public, anon, authenticated;

-- =====================================================================
-- 3. 트리거 (§11.4)
-- =====================================================================

-- on_auth_user_created: 프로필 자동 생성
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  mode text;
  init_status text;
begin
  mode := coalesce(cfg_text('signup_approval_mode'), 'auto');
  init_status := case when mode = 'auto' then 'approved' else 'pending' end;

  insert into profiles (
    id, email, display_name, avatar_url, role, auth_provider,
    approval_status, approved_at, current_level, yt_verify_code
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    'user',
    coalesce(new.raw_app_meta_data->>'provider', 'email'),
    init_status,
    case when init_status = 'approved' then now() else null end,
    'L0',
    'SR-VERIFY-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- trg_guard_profile: 보호 컬럼(current_level/approval_status/role/
-- level_expires_at/promotion_locked_until) 직접 수정 차단 (NFR-202)
-- service role, SQL 콘솔(postgres) 및 SECURITY DEFINER 함수 내부 호출은 허용
create function trg_guard_profile_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (
    new.current_level is distinct from old.current_level
    or new.approval_status is distinct from old.approval_status
    or new.role is distinct from old.role
    or new.level_expires_at is distinct from old.level_expires_at
    or new.promotion_locked_until is distinct from old.promotion_locked_until
  ) then
    if not (
      coalesce(auth.role(), 'service_role') = 'service_role'
      or coalesce(current_setting('app.internal_write', true), 'off') = 'on'
    ) then
      raise exception '보호된 컬럼은 직접 수정할 수 없습니다.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_guard_profile
before update on profiles
for each row execute function trg_guard_profile_fn();

-- trg_block_self_like: 자가 좋아요 차단 + 최근활동일 갱신
create function trg_block_self_like_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from videos where id = new.video_id and owner_id = new.actor_id) then
    raise exception '자기 영상에는 좋아요를 누를 수 없습니다';
  end if;

  update profiles set last_active_at = now() where id = new.actor_id;

  return new;
end;
$$;

create trigger trg_block_self_like
before insert on likes
for each row execute function trg_block_self_like_fn();

-- trg_validate_video: 시간 상한 검증, url_key 생성, 이상치 표시, 유튜브 소유권 대조
-- (관리자가 service role로 영상을 재승인할 때는 소유권 재검사를 건너뛴다 —
-- 유튜브 채널 인증 기능이 아직 없어 일반 등록 경로로는 통과할 수 없기 때문)
create function trg_validate_video_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_min integer;
  avg_duration numeric;
  is_trusted_write boolean;
begin
  if new.url_key is null and new.url is not null then
    new.url_key := lower(regexp_replace(regexp_replace(new.url, '[?#].*$', ''), '/+$', ''));
  end if;

  max_min := coalesce(cfg_int('max_video_duration_min'), 30);
  if new.duration_sec > max_min * 60 then
    raise exception '영상 시간이 상한(%분)을 넘습니다', max_min;
  end if;

  select avg(duration_sec) into avg_duration
  from videos where platform = new.platform and status = 'active';

  if avg_duration is not null and new.duration_sec > avg_duration * 3 then
    new.is_flagged := true;
  end if;

  is_trusted_write := coalesce(auth.role(), 'service_role') = 'service_role';

  if new.platform = 'youtube' and new.status = 'active' and not is_trusted_write then
    if not exists (
      select 1 from profiles
      where id = new.owner_id and yt_channel_id = new.yt_channel_id and yt_verified_at is not null
    ) then
      new.status := 'rejected'; -- FR-504
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validate_video
before insert or update on videos
for each row execute function trg_validate_video_fn();

create trigger trg_videos_set_updated_at
before update on videos
for each row execute function set_updated_at();

-- admin_reassign_video: 거절/삭제된 영상을 다른 사용자 계정으로 재배정해 승인한다.
-- 원본 기록은 남기되(status='reset') 식별정보(소유자/제목/url)를 비워 url_key
-- 유니크 제약과 충돌하지 않게 하고, 같은 내용을 새 행으로 다른 계정에 등록한다.
create function admin_reassign_video(
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

revoke execute on function admin_reassign_video(uuid, uuid, uuid) from public, anon, authenticated;

-- admin_reset_video: 대상 회원 지정 없이 영상을 그냥 초기화(무효화)한다.
create function admin_reset_video(p_video_id uuid, p_admin_id uuid) returns void
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

-- trg_validate_comment: 최소 글자수 검증 + 최근활동일 갱신
create function trg_validate_comment_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  min_len integer;
begin
  min_len := coalesce(cfg_int('min_comment_length'), 10);
  if length(trim(new.content)) < min_len then
    raise exception '댓글은 %자 이상 입력해 주세요', min_len;
  end if;

  update profiles set last_active_at = now() where id = new.actor_id;

  return new;
end;
$$;

create trigger trg_validate_comment
before insert on comments
for each row execute function trg_validate_comment_fn();

-- trg_eval_video: 영상 등록·수정·삭제 시 즉시 승급 판정 + 최근활동일 갱신
create function trg_eval_video_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  target := coalesce(new.owner_id, old.owner_id);
  if target is not null then
    update profiles set last_active_at = now() where id = target;
    perform apply_promotion(target);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_eval_video
after insert or update or delete on videos
for each row execute function trg_eval_video_fn();

create trigger trg_levels_set_updated_at
before update on levels
for each row execute function set_updated_at();

-- =====================================================================
-- 4. RLS (§8.3) — NFR-201: 전 테이블 적용
-- =====================================================================

alter table app_config enable row level security;
alter table levels enable row level security;
alter table profiles enable row level security;
alter table videos enable row level security;
alter table likes enable row level security;
alter table comments enable row level security;
alter table video_transcripts enable row level security;
alter table ai_feedbacks enable row level security;
alter table level_rules enable row level security;
alter table level_history enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;
alter table login_history enable row level security;

-- app_config: 전체 조회, admin만 쓰기
create policy app_config_select on app_config for select to authenticated using (true);
create policy app_config_write on app_config for all to authenticated
  using (is_admin()) with check (is_admin());

-- levels: 전체 조회, admin만 쓰기
create policy levels_select on levels for select to authenticated using (true);
create policy levels_write on levels for all to authenticated
  using (is_admin()) with check (is_admin());

-- level_rules: 전체 조회, admin만 쓰기
create policy level_rules_select on level_rules for select to authenticated using (true);
create policy level_rules_write on level_rules for all to authenticated
  using (is_admin()) with check (is_admin());

-- profiles: 로그인 사용자 전체 조회(§8.3 — 피드·댓글에서 작성자 표시에 필요),
-- 본인 수정(보호 컬럼은 트리거가 차단) 또는 admin
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update on profiles for update to authenticated
  using (auth.uid() = id or is_admin())
  with check (auth.uid() = id or is_admin());

-- videos: 로그인 사용자 전체 조회, 본인 소유 + 승인 상태만 쓰기(FR-708: 관리자는 열람만)
create policy videos_select on videos for select to authenticated using (true);
create policy videos_insert on videos for insert to authenticated
  with check (owner_id = auth.uid() and is_approved());
create policy videos_update on videos for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- likes: 로그인 사용자 전체 조회, 본인 + 승인 상태만 등록/삭제
create policy likes_select on likes for select to authenticated using (true);
create policy likes_insert on likes for insert to authenticated
  with check (actor_id = auth.uid() and is_approved());
create policy likes_delete on likes for delete to authenticated
  using (actor_id = auth.uid());

-- comments: active만 조회(admin은 전체), 본인+승인 상태만 작성,
-- 숨김 처리(FR-306)만 admin에게 허용(앱 레이어에서 status 컬럼만 갱신하도록 제한)
create policy comments_select on comments for select to authenticated
  using (status = 'active' or is_admin());
create policy comments_insert on comments for insert to authenticated
  with check (actor_id = auth.uid() and is_approved());
create policy comments_hide on comments for update to authenticated
  using (is_admin()) with check (is_admin());

-- video_transcripts: 본인 영상 + admin 조회, 쓰기는 시스템(service role)
create policy video_transcripts_select on video_transcripts for select to authenticated
  using (is_admin() or exists (select 1 from videos v where v.id = video_id and v.owner_id = auth.uid()));

-- ai_feedbacks: 본인 + admin 조회, 쓰기는 시스템(service role).
-- 상태(숨김/노출) 전환만 admin에게 허용(FR-608/NFR-206: 내용 수정 불가, 앱 레이어에서 status만 갱신)
create policy ai_feedbacks_select on ai_feedbacks for select to authenticated
  using (is_admin() or exists (select 1 from videos v where v.id = video_id and v.owner_id = auth.uid()));
create policy ai_feedbacks_toggle on ai_feedbacks for update to authenticated
  using (is_admin()) with check (is_admin());

-- level_history: 본인 + admin 조회, 쓰기는 시스템(SECURITY DEFINER 함수)
create policy level_history_select on level_history for select to authenticated
  using (auth.uid() = user_id or is_admin());

-- notifications: 본인만 조회/읽음 처리, 쓰기는 시스템
create policy notifications_select on notifications for select to authenticated
  using (auth.uid() = user_id);
create policy notifications_mark_read on notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- audit_log: admin만 조회, 쓰기는 시스템
create policy audit_log_select on audit_log for select to authenticated
  using (is_admin());

-- login_history: 최고관리자만 조회, 쓰기는 시스템
create policy login_history_select on login_history for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

-- =====================================================================
-- 5. 초기 데이터 (§6.4, §6.5, §5.1)
-- =====================================================================

insert into app_config (key, value, description) values
  ('site_name', '스토리룸 교사 그룹', '사이트 이름'),
  ('signup_approval_mode', 'auto', '가입 승인 모드 (auto|manual)'),
  ('retention_months', '6', '유지기간(개월)'),
  ('retention_warning_days', '30', '만료 경고 시작일'),
  ('promotion_cooldown_months', '1', '복귀 유예기간(개월)'),
  ('max_video_duration_min', '30', '영상 시간 상한(분)'),
  ('min_comment_length', '10', '댓글 최소 글자수'),
  ('yt_sync_hour', '3', '유튜브 동기화 시각(KST)'),
  ('ai_monthly_limit', '500', 'AI 코멘트 월 상한');

insert into levels (code, order_no, name, badge_color, has_retention) values
  ('L0', 0, 'Starter', '#C3CFCD,#8B9B98', false),
  ('L1', 1, 'Beginner', '#6BD3C4,#2A9187', true),
  ('L2', 2, 'Creator', '#1CC0AE,#0A6B62', true),
  ('L3', 3, 'Master', '#F0D588,#A97615', true);

-- 랜딩 페이지(SCR-01)용 공개 통계. RLS는 authenticated 대상이므로 비로그인
-- 방문자를 위해 SECURITY DEFINER 함수로 집계값만 노출한다(개인정보 없음).
create function public_stats()
returns table(teacher_count bigint, video_count bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from profiles where status = 'active') as teacher_count,
    (select count(*) from videos where status = 'active') as video_count;
$$;

grant execute on function public_stats() to anon, authenticated;

insert into level_rules (target_level, rule_type, metric_key, operator, threshold) values
  ('L1', 'promotion', 'video_count', '>=', 3),
  ('L1', 'promotion', 'total_duration_min', '>=', 15),
  ('L2', 'promotion', 'video_count', '>=', 10),
  ('L2', 'promotion', 'total_duration_min', '>=', 60),
  ('L3', 'promotion', 'video_count', '>=', 20),
  ('L3', 'promotion', 'total_duration_min', '>=', 150),
  ('L3', 'promotion', 'yt_video_count', '>=', 1),
  ('L3', 'promotion', 'yt_views', '>=', 500),
  ('L1', 'retention', 'video_count', '>=', 1),
  ('L2', 'retention', 'video_count', '>=', 3),
  ('L3', 'retention', 'video_count', '>=', 5),
  ('L3', 'retention', 'yt_video_count', '>=', 1);
