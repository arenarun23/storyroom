-- 회원이 메시지를 지워도 관리자 쪽 기록은 남긴다. 회원이 지우면 실제로는
-- 삭제하지 않고 hidden_for_user만 켜서 회원 본인 화면에서만 숨기고,
-- 관리자는 계속 볼 수 있게 한다. 단, 지우려는 메시지 내용이 비어 있으면
-- (보존할 내용이 없으므로) 완전히 삭제한다. 관리자가 지울 때는 기존처럼
-- 항상 완전히 삭제한다.

alter table messages add column if not exists hidden_for_user boolean not null default false;

drop policy if exists messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (
          t.admin_id = auth.uid()
          or (t.user_id = auth.uid() and not messages.hidden_for_user)
        )
    )
  );

drop policy if exists messages_update on messages;
create policy messages_update on messages for update to authenticated
  using (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id and t.user_id = auth.uid()
    )
  );

create or replace function trg_guard_message_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (
    new.content is distinct from old.content
    or new.sender_id is distinct from old.sender_id
    or new.sender_role is distinct from old.sender_role
    or new.thread_id is distinct from old.thread_id
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

drop trigger if exists trg_guard_message on messages;
create trigger trg_guard_message
before update on messages
for each row execute function trg_guard_message_fn();
