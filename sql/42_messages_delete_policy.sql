-- 대화 당사자가 스레드 안의 어떤 메시지든(본인이 보낸 것/상대가 보낸 것
-- 모두) 지울 수 있도록 DELETE 정책을 추가한다.

drop policy if exists messages_delete on messages;

create policy messages_delete on messages for delete to authenticated
  using (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id and (t.user_id = auth.uid() or t.admin_id = auth.uid())
    )
  );
