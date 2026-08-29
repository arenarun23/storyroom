-- 회원 ↔ 관리자 1대1 메시지 기능.
-- 회원이 관리자 목록에서 골라 대화를 시작하고, 그 대화는 해당 회원과
-- 관리자만 볼 수 있다. 새 메시지는 Supabase Realtime으로 실시간 반영된다.

create table if not exists message_threads (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  admin_id           uuid not null references profiles(id) on delete cascade,
  user_last_read_at  timestamptz,
  admin_last_read_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, admin_id)
);

create index if not exists idx_message_threads_user on message_threads(user_id);
create index if not exists idx_message_threads_admin on message_threads(admin_id);

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references message_threads(id) on delete cascade,
  sender_id   uuid references profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('user','admin')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_messages_thread on messages(thread_id, created_at);

create or replace function trg_guard_message_thread_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (
    new.user_id is distinct from old.user_id
    or new.admin_id is distinct from old.admin_id
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

drop trigger if exists trg_guard_message_thread on message_threads;
create trigger trg_guard_message_thread
before update on message_threads
for each row execute function trg_guard_message_thread_fn();

create or replace function trg_messages_touch_thread_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update message_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_messages_touch_thread on messages;
create trigger trg_messages_touch_thread
after insert on messages
for each row execute function trg_messages_touch_thread_fn();

alter table message_threads enable row level security;
alter table messages enable row level security;

drop policy if exists message_threads_select on message_threads;
drop policy if exists message_threads_insert on message_threads;
drop policy if exists message_threads_update on message_threads;
drop policy if exists messages_select on messages;
drop policy if exists messages_insert on messages;

create policy message_threads_select on message_threads for select to authenticated
  using (user_id = auth.uid() or admin_id = auth.uid());
create policy message_threads_insert on message_threads for insert to authenticated
  with check (
    user_id = auth.uid() and is_approved()
    and exists (select 1 from profiles where id = admin_id and role in ('admin', 'super_admin'))
  );
create policy message_threads_update on message_threads for update to authenticated
  using (user_id = auth.uid() or admin_id = auth.uid())
  with check (user_id = auth.uid() or admin_id = auth.uid());

create policy messages_select on messages for select to authenticated
  using (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id and (t.user_id = auth.uid() or t.admin_id = auth.uid())
    )
  );
create policy messages_insert on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (
          (t.user_id = auth.uid() and sender_role = 'user')
          or (t.admin_id = auth.uid() and sender_role = 'admin')
        )
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_threads'
  ) then
    alter publication supabase_realtime add table message_threads;
  end if;
end $$;
