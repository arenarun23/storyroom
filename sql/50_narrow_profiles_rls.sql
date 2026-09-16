-- 보안 감사 발견 사항: profiles_select 정책이 `using (true)`라서 로그인한
-- 회원 누구나 다른 회원의 실명·연락처·소속 학교·지역까지 조회할 수 있었다
-- (화면에는 안 보이지만 anon/authenticated 키로 직접 쿼리하면 노출됨).
--
-- 화면에서 실제로 필요한 "다른 회원"의 정보는 아래 세 갈래뿐이다:
--   1) 영상 피드/영상 상세/댓글: 작성자 표시이름·아바타·등급만 (list_videos_feed는
--      이미 SECURITY DEFINER라 문제 없음 — 영상 상세 페이지의 직접 join만 문제)
--   2) 회원이 관리자에게 메시지를 보낼 때: 관리자 목록의 이름·이메일
--   3) 메시지 스레드 상대방 표시: 회원 쪽에서는 상대 관리자의 이름·이메일,
--      관리자 쪽에서는 상대 회원의 이름·이메일(관리자는 is_admin()으로 이미 허용)
-- 이 세 갈래를 SECURITY DEFINER 함수로 좁혀서 노출하고, profiles 테이블 자체의
-- select 정책은 본인 또는 관리자로만 제한한다.

drop function if exists public_profile_card(uuid[]);
drop function if exists list_active_admins();
drop function if exists messaging_contact_info(uuid[]);

-- 영상 피드/상세·댓글 작성자 표시용 — 신원 확인 목적이 아니라 화면 표시용이라
-- 누구나(로그인 사용자) 조회 가능해도 안전한 최소 컬럼만 노출한다.
create function public_profile_card(p_ids uuid[])
returns table (id uuid, display_name text, avatar_url text, current_level text)
language sql stable security definer set search_path = public as $$
  select id, display_name, avatar_url, current_level
  from profiles
  where id = any(p_ids);
$$;

grant execute on function public_profile_card(uuid[]) to authenticated;

-- 회원이 메시지 보낼 관리자를 고를 때 쓰는 관리자 목록(이름·이메일).
create function list_active_admins()
returns table (id uuid, display_name text, email text)
language sql stable security definer set search_path = public as $$
  select id, display_name, email
  from profiles
  where role in ('admin', 'super_admin') and status = 'active'
  order by display_name;
$$;

grant execute on function list_active_admins() to authenticated;

-- 메시지 스레드 상대방 표시용. 본인 스레드에 실제로 등장하는 상대만 넘어오므로
-- (회원 입장에선 상대=관리자, 관리자 입장에선 상대=회원) role 기준과
-- is_admin()/본인 조건을 함께 둬서 양쪽 다 커버한다.
create function messaging_contact_info(p_ids uuid[])
returns table (id uuid, display_name text, email text)
language sql stable security definer set search_path = public as $$
  select id, display_name, email
  from profiles
  where id = any(p_ids)
    and (role in ('admin', 'super_admin') or id = auth.uid() or is_admin());
$$;

grant execute on function messaging_contact_info(uuid[]) to authenticated;

-- profiles_select를 본인 또는 관리자로 좁힌다. 다른 회원의 기본 정보가
-- 필요한 화면은 위 함수들을 거치도록 애플리케이션 코드도 함께 바꿨다.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (auth.uid() = id or is_admin());
