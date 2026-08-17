-- =====================================================================
-- 스토리룸 교사 그룹 — 5·6단계: 알림 · 회원탈퇴 · 관리자 기능
-- 시방서 v2.0 §3.7(FR-701~712) §3.9 §4.6 §4.7 기준
-- 01_schema.sql, 02_promotion_cooldown.sql, 03_video_feed.sql 다음에 실행한다.
-- 이 파일도 재실행에 안전하다(멱등).
--
-- 5단계(알림/탈퇴)는 이미 있는 notifications 테이블·withdraw_user() 함수를
-- 그대로 사용하므로 이 파일에서는 관리자(6단계) 함수만 추가한다.
-- =====================================================================

drop function if exists admin_list_members();
drop function if exists admin_member_metrics(uuid, timestamptz);
drop function if exists admin_reevaluate_all();

-- 회원 전체(관리자 포함)를 지표와 함께 반환한다(§4.6 회원관리 테이블).
-- 필터·정렬은 회원 수가 많지 않은 이 서비스 규모(§1.6 300명대)에서는
-- 클라이언트에서 처리해도 충분하므로, 여기서는 매 행에 필요한 지표만 계산해 넘긴다.
create function admin_list_members()
returns table (
  id uuid,
  display_name text,
  email text,
  role text,
  current_level text,
  level_updated_at timestamptz,
  level_expires_at timestamptz,
  promotion_locked_until timestamptz,
  manual_override boolean,
  status text,
  approval_status text,
  yt_verified_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz,
  video_count integer,
  total_duration_min numeric,
  received_likes integer,
  received_comments integer,
  given_likes integer,
  given_comments integer,
  yt_views bigint,
  flagged_count integer,
  real_name text,
  region text,
  phone text,
  school_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception '권한이 없습니다';
  end if;

  return query
  select
    p.id, p.display_name, p.email, p.role, p.current_level, p.level_updated_at,
    p.level_expires_at, p.promotion_locked_until, p.manual_override, p.status,
    p.approval_status, p.yt_verified_at, p.last_active_at, p.created_at,
    m.video_count, m.total_duration_min, m.received_likes, m.received_comments,
    m.given_likes, m.given_comments, m.yt_views,
    (
      select count(*)::integer from videos v
      where v.owner_id = p.id and v.is_flagged and v.status = 'active'
    ) as flagged_count,
    p.real_name, p.region, p.phone, p.school_name
  from profiles p
  cross join lateral get_user_metrics(p.id, null) m;
end;
$$;

grant execute on function admin_list_members() to authenticated;

-- 회원 상세 패널의 "지표" 탭 — 누적 vs 최근 기간 비교용 (FR-705)
create function admin_member_metrics(p_user uuid, p_since timestamptz default null)
returns user_metrics
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception '권한이 없습니다';
  end if;
  return get_user_metrics(p_user, p_since);
end;
$$;

grant execute on function admin_member_metrics(uuid, timestamptz) to authenticated;

-- FR-711: 전체 재판정 수동 실행 (수동조정 회원은 제외)
create function admin_reevaluate_all() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
  cnt integer := 0;
begin
  if not is_admin() then
    raise exception '권한이 없습니다';
  end if;

  for prof in
    select id from profiles
    where role = 'user' and approval_status = 'approved'
      and status = 'active' and manual_override = false
  loop
    perform apply_promotion(prof.id);
    cnt := cnt + 1;
  end loop;

  return cnt;
end;
$$;

grant execute on function admin_reevaluate_all() to authenticated;
