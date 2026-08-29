"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deleteMessage,
  deleteThread,
  getOrCreateThread,
  listAdminsForMessaging,
  listMessages,
  listThreadsForViewer,
  markThreadRead,
  sendMessage,
  type AdminOption,
  type ThreadSummary,
} from "@/app/messages/actions";
import type { Message } from "@/lib/types";

type View = "list" | "compose" | { threadId: string };

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

export default function MessageWidget() {
  const [myId, setMyId] = useState<string | null>(null);
  const [isAdminViewer, setIsAdminViewer] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<View>("list");
  viewRef.current = view;

  const refreshThreads = useCallback(async () => {
    const t = await listThreadsForViewer();
    setThreads(t);
  }, []);

  const openThread = useCallback(async (threadId: string) => {
    setView({ threadId });
    const msgs = await listMessages(threadId);
    setMessages(msgs);
    await markThreadRead(threadId);
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t)));
  }, []);

  // 최초 로딩: 내 uid/역할 확인 후 스레드 목록을 가져온다.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setMyId(user.id);

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (!cancelled) setIsAdminViewer(profile?.role === "admin" || profile?.role === "super_admin");

      const t = await listThreadsForViewer();
      if (!cancelled) setThreads(t);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 실시간 구독: 새 메시지/새 스레드가 생기면 목록을 갱신하고, 현재 보고
  // 있는 스레드라면 메시지도 즉시 반영한다.
  useEffect(() => {
    if (!myId) return;
    const supabase = createClient();

    const channel = supabase
      .channel("messages-widget")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as Message;
        refreshThreads();
        const current = viewRef.current;
        if (typeof current === "object" && current.threadId === row.thread_id) {
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_id !== myId) markThreadRead(row.thread_id);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_threads" }, () => {
        refreshThreads();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const row = payload.old as Partial<Message>;
        if (!row.id) return;
        refreshThreads();
        setMessages((prev) => prev.filter((m) => m.id !== row.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, refreshThreads]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleOpenCompose() {
    setView("compose");
    if (admins.length === 0) {
      setAdminsLoading(true);
      const list = await listAdminsForMessaging();
      setAdmins(list);
      setAdminsLoading(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await deleteMessage(messageId);
    refreshThreads();
  }

  async function handleDeleteThread(threadId: string) {
    if (!window.confirm("이 대화를 목록에서 삭제할까요?")) return;
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    await deleteThread(threadId);
  }

  async function handlePickAdmin(adminId: string) {
    const result = await getOrCreateThread(adminId);
    if (!result.ok) return;
    await refreshThreads();
    await openThread(result.threadId);
  }

  async function handleSend() {
    const threadId = typeof view === "object" ? view.threadId : null;
    const text = input.trim();
    if (!threadId || !text || sending) return;
    setSending(true);
    setInput("");
    await sendMessage(threadId, text);
    setSending(false);
  }

  const unreadTotal = threads.reduce((sum, t) => sum + t.unreadCount, 0);
  const activeThread = typeof view === "object" ? threads.find((t) => t.id === view.threadId) : null;

  if (!myId) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
      {open && (
        <div className="card absolute bottom-16 right-0 flex h-[480px] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 shadow-[var(--shadow-s3)]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            {view !== "list" && (
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="목록으로"
                className="text-muted hover:text-ink"
              >
                ←
              </button>
            )}
            <span className="flex-1 truncate text-sm font-semibold text-ink">
              {view === "list" ? "메시지" : view === "compose" ? "새 메시지" : (activeThread?.otherName ?? "대화")}
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-muted hover:text-ink">
              ×
            </button>
          </div>

          {view === "list" && (
            <div className="flex flex-1 flex-col overflow-hidden">
              {!isAdminViewer && (
                <button
                  type="button"
                  onClick={handleOpenCompose}
                  className="border-b border-line px-4 py-2.5 text-left text-sm font-medium text-teal-deep hover:bg-teal-soft/50"
                >
                  + 새 메시지
                </button>
              )}
              <div className="flex-1 overflow-y-auto">
                {threads.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted">대화가 없습니다.</p>
                ) : (
                  threads.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-stretch border-b border-line last:border-b-0 hover:bg-teal-soft/30"
                    >
                      <button
                        type="button"
                        onClick={() => openThread(t.id)}
                        className="flex flex-1 flex-col gap-0.5 px-4 py-3 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink">
                            {t.otherName ?? t.otherEmail}
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
                            {timeAgo(t.lastMessageAt)}
                          </span>
                          {t.unreadCount > 0 && (
                            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold text-white">
                              {t.unreadCount > 9 ? "9+" : t.unreadCount}
                            </span>
                          )}
                        </div>
                        {t.lastMessage && <p className="truncate text-xs text-muted">{t.lastMessage}</p>}
                      </button>
                      {!isAdminViewer && (
                        <button
                          type="button"
                          onClick={() => handleDeleteThread(t.id)}
                          aria-label="대화 삭제"
                          className="flex w-10 shrink-0 items-center justify-center text-muted hover:text-danger"
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-card text-xs">
                            ×
                          </span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {view === "compose" && (
            <div className="flex-1 overflow-y-auto">
              {adminsLoading ? (
                <p className="p-6 text-center text-sm text-muted">잠시만 기다려 주세요.</p>
              ) : admins.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">문의 가능한 관리자가 없습니다.</p>
              ) : (
                admins.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handlePickAdmin(a.id)}
                    className="flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-teal-soft/30"
                  >
                    <span className="text-sm font-semibold text-ink">{a.display_name ?? "관리자"}</span>
                    <span className="text-xs text-muted">{a.email}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {typeof view === "object" && (
            <>
              <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                {messages.map((m) => {
                  const mine = m.sender_id === myId;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
                    >
                      {mine && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(m.id)}
                          aria-label="메시지 삭제"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-card text-xs text-muted transition-colors duration-150 hover:border-danger hover:bg-danger hover:text-white"
                        >
                          ×
                        </button>
                      )}
                      <div
                        className={`max-w-[75%] rounded-[12px] px-3 py-2 text-sm ${
                          mine ? "bg-teal text-white" : "bg-paper text-ink"
                        }`}
                      >
                        {m.content}
                      </div>
                      {!mine && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(m.id)}
                          aria-label="메시지 삭제"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-card text-xs text-muted transition-colors duration-150 hover:border-danger hover:bg-danger hover:text-white"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 border-t border-line p-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="메시지 입력..."
                  className="input-field flex-1 px-3 text-sm"
                  aria-label="메시지 입력"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="chip bg-teal px-4 text-xs font-semibold text-white disabled:pointer-events-none disabled:opacity-50"
                >
                  전송
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="group relative">
        {!open && !isAdminViewer && (
          <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-56 rounded-[10px] border border-line bg-card px-3 py-2 text-xs text-ink opacity-0 shadow-[var(--shadow-s2)] transition-opacity duration-150 group-hover:opacity-100">
            문의사항이나 요청할 내용이 있으면 원하는 관리자에게 메세지를 보내주세요.
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="메시지"
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-teal text-2xl text-white shadow-[var(--shadow-s3)] transition-transform duration-150 hover:bg-teal-deep active:scale-95"
        >
          💬
          {unreadTotal > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 font-mono text-[11px] font-bold text-white">
              {unreadTotal > 9 ? "9+" : unreadTotal}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
