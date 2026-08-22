"use client";

import { useMemo, useState, useTransition } from "react";
import { fetchActivityFeed, type ActivityRow } from "@/app/admin/activity/actions";
import { formatDateTimeKST } from "@/lib/format";
import MemberSearchSelect from "@/components/MemberSearchSelect";

interface MemberOption {
  id: string;
  display_name: string | null;
  email: string;
}

const TYPE_LABELS: Record<ActivityRow["activity_type"], string> = {
  login: "로그인",
  video: "영상 등록",
  comment: "댓글",
  like: "좋아요",
  signup: "회원가입",
};

const TYPE_COLORS: Record<ActivityRow["activity_type"], string> = {
  login: "border-line text-muted",
  video: "border-teal/40 bg-teal-soft text-teal-deep",
  comment: "border-gold/40 bg-gold-soft text-gold",
  like: "border-danger/40 bg-danger/10 text-danger",
  signup: "border-ink/30 bg-ink/5 text-ink",
};

export default function ActivityFeedClient({
  initialRows,
  members,
}: {
  initialRows: ActivityRow[];
  members: MemberOption[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [userId, setUserId] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<ActivityRow["activity_type"]>>(
    new Set(["login", "video", "comment", "like", "signup"]),
  );
  const [cursor, setCursor] = useState<string | null>(
    initialRows.length === 50 ? initialRows[initialRows.length - 1].created_at : null,
  );
  const [pending, startTransition] = useTransition();

  function toggleType(t: ActivityRow["activity_type"]) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function applyUserFilter(id: string) {
    setUserId(id);
    startTransition(async () => {
      const { rows: page, nextCursor } = await fetchActivityFeed(null, id || null);
      setRows(page);
      setCursor(nextCursor);
    });
  }

  function loadMore() {
    startTransition(async () => {
      const { rows: page, nextCursor } = await fetchActivityFeed(cursor, userId || null);
      setRows((prev) => [...prev, ...page]);
      setCursor(nextCursor);
    });
  }

  const filtered = useMemo(() => rows.filter((r) => typeFilter.has(r.activity_type)), [rows, typeFilter]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-title text-xl font-bold text-ink">회원 활동</h1>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <MemberSearchSelect members={members} value={userId} onChange={applyUserFilter} placeholder="전체 회원" />
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as ActivityRow["activity_type"][]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={`chip px-3 text-xs font-semibold transition-colors duration-150 ${
                typeFilter.has(t)
                  ? "bg-teal text-white"
                  : "border border-line text-muted hover:bg-teal-soft hover:text-teal-deep"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="card p-12 text-center text-sm text-muted">조건에 맞는 활동 기록이 없습니다.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <ul className="flex flex-col">
            {filtered.map((r, i) => (
              <li
                key={`${r.activity_type}-${r.user_id}-${r.created_at}-${i}`}
                className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0"
              >
                <span className={`chip border px-2 text-[11px] font-semibold ${TYPE_COLORS[r.activity_type]}`}>
                  {TYPE_LABELS[r.activity_type]}
                </span>
                <span className="font-medium text-ink">{r.display_name ?? "이름 없음"}</span>
                <span className="text-xs text-muted">{r.email}</span>
                {r.detail && <span className="max-w-md truncate text-xs text-muted">{r.detail}</span>}
                <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                  {formatDateTimeKST(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cursor && (
        <button
          type="button"
          disabled={pending}
          onClick={loadMore}
          className="chip self-center border border-line px-6 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-teal-soft hover:text-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "불러오는 중..." : "더 보기"}
        </button>
      )}
    </div>
  );
}
