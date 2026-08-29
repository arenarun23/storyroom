"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Message, MessageThread } from "@/lib/types";

export interface AdminOption {
  id: string;
  display_name: string | null;
  email: string;
}

// 회원이 새 대화를 시작할 때 고를 수 있는 관리자 목록.
export async function listAdminsForMessaging(): Promise<AdminOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("role", ["admin", "super_admin"])
    .eq("status", "active")
    .order("display_name");
  return data ?? [];
}

// 골라둔 관리자와의 스레드가 있으면 재사용하고, 없으면 새로 만든다
// (user_id, admin_id 유니크 제약으로 한 쌍당 스레드 하나만 존재).
export async function getOrCreateThread(
  adminId: string,
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("approval_status")
    .eq("id", user.id)
    .single();

  if (profile?.approval_status !== "approved") {
    return { ok: false, message: "승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다." };
  }

  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("user_id", user.id)
    .eq("admin_id", adminId)
    .maybeSingle();

  if (existing) return { ok: true, threadId: existing.id };

  const { data: created, error } = await supabase
    .from("message_threads")
    .insert({ user_id: user.id, admin_id: adminId })
    .select("id")
    .single();

  if (error || !created) return { ok: false, message: "대화를 시작하지 못했습니다." };
  return { ok: true, threadId: created.id };
}

export interface ThreadSummary {
  id: string;
  otherId: string;
  otherName: string | null;
  otherEmail: string;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

// 내가(회원 또는 관리자로서) 참여 중인 모든 스레드를 최신순으로 요약해 반환한다.
export async function listThreadsForViewer(): Promise<ThreadSummary[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: threads } = await supabase
    .from("message_threads")
    .select("*")
    .or(`user_id.eq.${user.id},admin_id.eq.${user.id}`)
    .order("updated_at", { ascending: false })
    .returns<MessageThread[]>();

  if (!threads || threads.length === 0) return [];

  const otherIds = threads.map((t) => (t.user_id === user.id ? t.admin_id : t.user_id));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", otherIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const threadIds = threads.map((t) => t.id);
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<Message[]>();

  const byThread = new Map<string, Message[]>();
  (messages ?? []).forEach((m) => {
    const arr = byThread.get(m.thread_id) ?? [];
    arr.push(m);
    byThread.set(m.thread_id, arr);
  });

  return threads.map((t) => {
    const isUser = t.user_id === user.id;
    const otherId = isUser ? t.admin_id : t.user_id;
    const other = profileMap.get(otherId);
    const ownLastRead = isUser ? t.user_last_read_at : t.admin_last_read_at;
    const msgs = byThread.get(t.id) ?? [];
    const last = msgs[0];
    const unreadCount = msgs.filter(
      (m) => m.sender_id !== user.id && (!ownLastRead || m.created_at > ownLastRead),
    ).length;

    return {
      id: t.id,
      otherId,
      otherName: other?.display_name ?? null,
      otherEmail: other?.email ?? "",
      lastMessage: last?.content ?? null,
      lastMessageAt: last?.created_at ?? t.created_at,
      unreadCount,
    };
  });
}

export async function listMessages(threadId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .returns<Message[]>();
  return data ?? [];
}

export async function sendMessage(threadId: string, content: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false, message: "메시지를 입력해 주세요." };

  const { data: thread } = await supabase
    .from("message_threads")
    .select("user_id, admin_id")
    .eq("id", threadId)
    .single();
  if (!thread) return { ok: false, message: "대화를 찾을 수 없습니다." };

  const senderRole = thread.user_id === user.id ? "user" : "admin";

  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    sender_role: senderRole,
    content: trimmed,
  });

  if (error) return { ok: false, message: "전송에 실패했습니다." };
  return { ok: true };
}

// 대화 당사자는 본인이 보낸 메시지든 상대가 보낸 메시지든 지울 수 있다.
// 다만 회원(관리자가 아닌 쪽)이 지우면 실제로는 지우지 않고
// hidden_for_user만 켜서 회원 본인 화면에서만 숨기고 관리자 쪽 기록은
// 남긴다. 지우려는 메시지 내용이 비어 있으면 보존할 게 없으므로 완전히
// 삭제한다. 관리자가 지울 때는 항상 완전히 삭제한다.
export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { data: msg } = await supabase
    .from("messages")
    .select("content, thread_id")
    .eq("id", messageId)
    .single();
  if (!msg) return { ok: false, message: "메시지를 찾을 수 없습니다." };

  const { data: thread } = await supabase
    .from("message_threads")
    .select("user_id")
    .eq("id", msg.thread_id)
    .single();
  if (!thread) return { ok: false, message: "대화를 찾을 수 없습니다." };

  const isUserActor = thread.user_id === user.id;
  const isBlank = msg.content.trim().length === 0;

  if (!isUserActor || isBlank) {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) return { ok: false, message: "삭제에 실패했습니다." };
    return { ok: true };
  }

  const { error } = await supabase.from("messages").update({ hidden_for_user: true }).eq("id", messageId);
  if (error) return { ok: false, message: "삭제에 실패했습니다." };
  return { ok: true };
}

export async function markThreadRead(threadId: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: thread } = await supabase
    .from("message_threads")
    .select("user_id, admin_id")
    .eq("id", threadId)
    .single();
  if (!thread) return;

  const patch =
    thread.user_id === user.id
      ? { user_last_read_at: new Date().toISOString() }
      : { admin_last_read_at: new Date().toISOString() };

  await supabase.from("message_threads").update(patch).eq("id", threadId);
}
