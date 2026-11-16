-- 보안 점검 Low 등급 발견 사항 + 탈퇴 버그 수정.
--   A) 탈퇴 버그: 블로그 게시물이 있는 회원은 탈퇴가 실패했다
--   B) 로그인 전용이어야 할 SECURITY DEFINER 함수를 anon도 호출할 수 있었다
--   C) 관리자가 본인 세션으로 다른 회원(최고관리자 포함)의 profiles 행을 직접 수정 가능
--   D) 강등·정지된 관리자가 기존 메시지 스레드를 계속 읽고 쓸 수 있었다
--   E) 회원이 API를 직접 호출하면 메시지/스레드를 완전 삭제해
--      "관리자 쪽 기록 보존" 규칙을 우회할 수 있었다
--   F) 회원의 메시지/대화 숨기기(삭제 버튼)가 RLS 때문에 항상 실패했다
--
-- 51_guard_member_writable_columns.sql(is_trusted_write) 이후에 실행한다.

------------------------------------------------------------------------------
-- A) 탈퇴 버그: withdraw_user()는 탈퇴 회원의 블로그 게시물 url을 null로
--    지우는데(개인정보 삭제) blog_posts.url이 NOT NULL이라 제약 위반으로
--    탈퇴 전체가 실패했다. videos.url과 같게 null을 허용한다.
------------------------------------------------------------------------------
alter table blog_posts alter column url drop not null;

------------------------------------------------------------------------------
-- B) anon 실행 권한 회수. Postgres는 새 함수의 EXECUTE를 PUBLIC에 기본
--    부여하고 Supabase는 anon에도 부여하므로, "grant ... to authenticated"만
--    으로는 anon 호출이 막히지 않는다. 시그니처가 바뀌어도 동작하도록
--    이름으로 찾아서 회수한다. (랜딩 페이지용 public_stats/public_level_stats는
--    의도적으로 anon에 열어 둔 함수라 건드리지 않는다.)
------------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'list_videos_feed', 'list_active_admins',
        'messaging_contact_info', 'public_profile_card'
      )
  loop
    execute format('revoke execute on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated, service_role', fn.sig);
  end loop;
end $$;

------------------------------------------------------------------------------
-- C) profiles_update: 본인 행만. 관리자의 회원 정보 수정은 전부 서버 액션
--    (service role)으로 하고 있어서 정책의 관리자 분기는 쓰이지 않았고,
--    최고관리자 보호 규칙(서버 액션에만 있음)을 우회하는 통로였다.
------------------------------------------------------------------------------
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

------------------------------------------------------------------------------
-- D) 메시지: 관리자 쪽 접근은 "지금도 활성 관리자"일 때만
------------------------------------------------------------------------------
create or replace function is_active_admin(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = p_user and role in ('admin', 'super_admin') and status = 'active'
  );
$$;

revoke execute on function is_active_admin(uuid) from public, anon;
grant execute on function is_active_admin(uuid) to authenticated, service_role;

-- 스레드에 메시지가 하나라도 있는지. 회원 본인 RLS로는 숨긴(hidden_for_user)
-- 메시지가 안 보이므로, 정책 안에서 정확히 판단하려면 SECURITY DEFINER가 필요하다.
-- 스레드 당사자가 아니면 항상 true(=삭제 불가)를 돌려 존재 여부를 노출하지 않는다.
create or replace function thread_has_messages(p_thread uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
           select 1 from message_threads t
           where t.id = p_thread and (t.user_id = auth.uid() or t.admin_id = auth.uid())
         )
      or exists (select 1 from messages m where m.thread_id = p_thread);
$$;

revoke execute on function thread_has_messages(uuid) from public, anon;
grant execute on function thread_has_messages(uuid) to authenticated, service_role;

drop policy if exists message_threads_select on message_threads;
create policy message_threads_select on message_threads for select to authenticated
  using (
    (admin_id = auth.uid() and is_active_admin())
    or (user_id = auth.uid() and not hidden_for_user)
  );

-- 기존 정책은 profiles를 직접 조회해 상대가 관리자인지 확인했는데,
-- 50_narrow_profiles_rls.sql 이후 회원은 관리자의 profiles 행을 볼 수 없어서
-- 새 대화 시작이 항상 실패했다. SECURITY DEFINER 함수로 확인하도록 바꾼다.
drop policy if exists message_threads_insert on message_threads;
create policy message_threads_insert on message_threads for insert to authenticated
  with check (
    user_id = auth.uid() and is_approved()
    and is_active_admin(admin_id)
  );

drop policy if exists message_threads_update on message_threads;
create policy message_threads_update on message_threads for update to authenticated
  using (user_id = auth.uid() or (admin_id = auth.uid() and is_active_admin()))
  with check (user_id = auth.uid() or (admin_id = auth.uid() and is_active_admin()));

drop policy if exists messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (
          (t.admin_id = auth.uid() and is_active_admin())
          or (t.user_id = auth.uid() and not messages.hidden_for_user)
        )
    )
  );

drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (
          (t.user_id = auth.uid() and sender_role = 'user')
          or (t.admin_id = auth.uid() and sender_role = 'admin' and is_active_admin())
        )
    )
  );

------------------------------------------------------------------------------
-- E) 완전 삭제(DELETE)를 서버 액션의 규칙과 같게 DB에서도 강제한다.
--    - 메시지: 관리자는 항상 삭제 가능, 회원은 내용이 빈 메시지만
--    - 스레드: 관리자는 삭제 가능, 회원은 메시지가 하나도 없는 빈 대화만
--    회원이 내용 있는 메시지/대화를 지울 때는 기존대로 hidden_for_user(UPDATE)를 쓴다.
------------------------------------------------------------------------------
drop policy if exists messages_delete on messages;
create policy messages_delete on messages for delete to authenticated
  using (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (
          (t.admin_id = auth.uid() and is_active_admin())
          or (t.user_id = auth.uid() and messages.content !~ '\S')
        )
    )
  );

drop policy if exists message_threads_delete on message_threads;
create policy message_threads_delete on message_threads for delete to authenticated
  using (
    (admin_id = auth.uid() and is_active_admin())
    or (user_id = auth.uid() and not thread_has_messages(id))
  );

-- 메시지 작성 시각도 보호 컬럼에 추가한다(회원이 관리자 메시지의 시각을 바꿀 수 있었다).
create or replace function trg_guard_message_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (
    new.id is distinct from old.id
    or new.content is distinct from old.content
    or new.sender_id is distinct from old.sender_id
    or new.sender_role is distinct from old.sender_role
    or new.thread_id is distinct from old.thread_id
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
-- F) 회원의 "숨기기"가 실제로 동작하도록 SECURITY DEFINER 함수로 옮긴다.
--    Postgres는 UPDATE 결과 행도 SELECT 정책을 통과해야 하는데, 회원의 SELECT
--    정책이 "not hidden_for_user"라서 hidden_for_user=true로 바꾸는 UPDATE가
--    항상 RLS 위반으로 실패했다(메시지/대화 삭제 버튼이 실패). 숨긴 대화를 다시
--    여는 UPDATE도 숨긴 행이 본인에게 안 보여서 0건 처리됐다.
--    함수 안에서 "스레드의 회원 본인"인지 직접 확인한 뒤 플래그만 바꾼다.
------------------------------------------------------------------------------
create or replace function set_thread_hidden(p_thread uuid, p_hidden boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update message_threads
  set hidden_for_user = p_hidden
  where id = p_thread and user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function hide_message(p_message uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update messages m
  set hidden_for_user = true
  from message_threads t
  where m.id = p_message and t.id = m.thread_id and t.user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function set_thread_hidden(uuid, boolean) from public, anon;
revoke execute on function hide_message(uuid) from public, anon;
grant execute on function set_thread_hidden(uuid, boolean) to authenticated, service_role;
grant execute on function hide_message(uuid) to authenticated, service_role;
