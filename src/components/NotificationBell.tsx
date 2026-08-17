"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

const TYPE_ICON: Record<Notification["type"], string> = {
  promotion: "🎉",
  demotion: "⚠️",
  expiry_warning: "⏰",
  ai_comment: "🤖",
  approval: "✅",
};

// FR-801~804: 승급·강등·만료임박·승인 알림 + 미읽음 표시
export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30)
        .returns<Notification[]>();
      if (!cancelled) setNotifications(data ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markAllRead() {
    if (unreadCount === 0) return;
    const supabase = createClient();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-teal-soft"
        aria-label="알림"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="card absolute right-0 z-20 mt-2 w-80 max-w-[90vw] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">알림</span>
            <button type="button" onClick={markAllRead} className="text-xs font-medium text-teal-deep">
              모두 읽음
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">알림이 없습니다.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-2 border-b border-line px-4 py-3 last:border-b-0 ${
                    n.is_read ? "" : "bg-teal-soft/50"
                  }`}
                >
                  <span className="text-base leading-none">{TYPE_ICON[n.type]}</span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-semibold text-ink">{n.title}</p>
                    {n.body && <p className="text-xs text-muted">{n.body}</p>}
                    <p className="font-mono text-[11px] text-muted">
                      {new Date(n.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
