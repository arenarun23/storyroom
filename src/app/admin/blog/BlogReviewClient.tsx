"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminSetBlogPostStatus } from "@/app/admin/records/actions";
import { formatDateKST } from "@/lib/format";

export interface AdminBlogPostRow {
  id: string;
  owner_id: string | null;
  title: string | null;
  url: string | null;
  status: "active" | "pending" | "rejected" | "deleted" | "withdrawn";
  created_at: string;
  owner: { display_name: string | null; email: string } | null;
}

const STATUS_LABELS: Record<AdminBlogPostRow["status"], string> = {
  active: "활성",
  pending: "승인 대기",
  rejected: "거절",
  deleted: "삭제됨",
  withdrawn: "탈퇴 회원",
};

const STATUS_FILTERS: { value: "" | AdminBlogPostRow["status"]; label: string }[] = [
  { value: "", label: "전체" },
  { value: "pending", label: "승인 대기" },
  { value: "active", label: "활성" },
  { value: "rejected", label: "거절" },
  { value: "deleted", label: "삭제됨" },
  { value: "withdrawn", label: "탈퇴 회원" },
];

export default function BlogReviewClient({ posts }: { posts: AdminBlogPostRow[] }) {
  const [statusFilter, setStatusFilter] = useState<"" | AdminBlogPostRow["status"]>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) map.set(p.status, (map.get(p.status) ?? 0) + 1);
    return map;
  }, [posts]);

  const filtered = posts.filter((p) => !statusFilter || p.status === statusFilter);

  function handleSetStatus(postId: string, status: "active" | "deleted" | "rejected") {
    setBusyId(postId);
    adminSetBlogPostStatus(postId, status).finally(() => {
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-title text-xl font-bold text-ink">블로그 검토</h1>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`chip px-4 text-xs font-semibold transition-colors duration-150 ${
              statusFilter === f.value ? "bg-teal text-white" : "border border-line text-muted hover:text-ink"
            }`}
          >
            {f.label} ({f.value ? (counts.get(f.value) ?? 0) : posts.length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="card p-12 text-center text-sm text-muted">조건에 맞는 게시물이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => {
            const busy = busyId === p.id;
            return (
              <div
                key={p.id}
                className={`card flex flex-col gap-2 p-4 transition-opacity duration-150 ${
                  busy ? "opacity-50" : "opacity-100"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`chip border px-2 text-[11px] font-semibold ${
                      p.status === "rejected"
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : p.status === "pending"
                          ? "border-gold/40 bg-gold-soft text-gold"
                          : "border-line text-muted"
                    }`}
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                  <span className="ml-auto font-mono text-muted">{formatDateKST(p.created_at)}</span>
                </div>

                <p className="text-sm font-semibold text-ink">
                  {p.owner?.display_name ?? (p.owner_id ? "이름 없음" : "탈퇴한 회원")}
                  {p.owner?.email && <span className="ml-1 font-normal text-muted">({p.owner.email})</span>}
                </p>

                {p.title && <p className="text-sm text-ink">{p.title}</p>}
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-muted hover:text-teal-deep hover:underline"
                  >
                    {p.url}
                  </a>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {p.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleSetStatus(p.id, "active")}
                        className="chip border border-line px-3 text-[11px] font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "승인"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleSetStatus(p.id, "rejected")}
                        className="chip border border-line px-3 text-[11px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "거절"}
                      </button>
                    </>
                  ) : p.status === "active" ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => handleSetStatus(p.id, "deleted")}
                      className="chip border border-line px-3 text-[11px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {busy ? "처리 중..." : "삭제"}
                    </button>
                  ) : (
                    (p.status === "deleted" || p.status === "rejected") && (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleSetStatus(p.id, "active")}
                        className="chip border border-line px-3 text-[11px] font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "승인"}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
