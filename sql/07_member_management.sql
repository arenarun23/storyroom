-- =====================================================================
-- 스토리룸 교사 그룹 — 관리자 회원 수동 등록 지원
-- 01_schema.sql ~ 06_onboarding.sql 다음에 실행한다. 재실행에 안전하다(멱등).
--
-- handle_new_user()가 auth_provider를 'google'로 고정하고 있었다. 관리자가
-- 이메일+비밀번호로 회원을 직접 만들 수 있게 되면서, 실제 가입 경로
-- (auth.users.raw_app_meta_data.provider)를 반영하도록 고친다.
-- =====================================================================

create or replace function handle_new_user() returns trigger
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
