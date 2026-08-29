-- 회원이 메시지 목록에서 관리자와의 대화(스레드) 자체를 지울 수 있게 한다.
-- 대화에 메시지가 있으면 실제로는 지우지 않고 회원 본인 목록에서만
-- 숨기고(hidden_for_user), 관리자 목록에는 그대로 남긴다. 메시지가
-- 하나도 없는 빈 대화는 완전히 삭제한다.

alter table message_threads add column if not exists hidden_for_user boolean not null default false;

drop policy if exists message_threads_select on message_threads;
create policy message_threads_select on message_threads for select to authenticated
  using (
    admin_id = auth.uid()
    or (user_id = auth.uid() and not hidden_for_user)
  );

drop policy if exists message_threads_delete on message_threads;
create policy message_threads_delete on message_threads for delete to authenticated
  using (user_id = auth.uid() or admin_id = auth.uid());
