"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminReassignVideo, adminResetVideo, adminSetVideoStatus } from "@/app/admin/records/actions";
import { formatDateKST, formatDuration } from "@/lib/format";
import MemberSearchSelect from "@/components/MemberSearchSelect";
import OutlierBadge from "@/components/OutlierBadge";

export interface AdminVideoRow {
  id: string;
  owner_id: string | null;
  platform: "storyroom" | "youtube";
  title: string | null;
  url: string | null;
  duration_sec: number;
  status: "active" | "rejected" | "deleted" | "withdrawn" | "reset";
  is_flagged: boolean;
  created_at: string;
  owner: { display_name: string | null; email: string } | null;
  reassigned_to: { display_name: string | null; email: string } | null;
}

export interface AdminMemberOption {
  id: string;
  display_name: string | null;
  email: string;
}

const STATUS_LABELS: Record<AdminVideoRow["status"], string> = {
  active: "활성",
  rejected: "거절",
  deleted: "삭제됨",
  withdrawn: "탈퇴 회원",
  reset: "초기화됨",
};

const STATUS_FILTERS: { value: "" | AdminVideoRow["status"]; label: string }[] = [
  { value: "rejected", label: "거절" },
  { value: "", label: "전체" },
  { value: "active", label: "활성" },
  { value: "deleted", label: "삭제됨" },
  { value: "withdrawn", label: "탈퇴 회원" },
  { value: "reset", label: "초기화됨" },
];

export default function VideoReviewClient({
  videos,
  members,
}: {
  videos: AdminVideoRow[];
  members: AdminMemberOption[];
}) {
  const [statusFilter, setStatusFilter] = useState<"" | AdminVideoRow["status"]>("rejected");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reassignForId, setReassignForId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState("");
  const router = useRouter();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of videos) map.set(v.status, (map.get(v.status) ?? 0) + 1);
    return map;
  }, [videos]);

  const filtered = videos.filter((v) => {
    if (statusFilter && v.status !== statusFilter) return false;
    if (flaggedOnly && !v.is_flagged) return false;
    return true;
  });

  function handleSetStatus(videoId: string, status: "active" | "deleted") {
    setBusyId(videoId);
    adminSetVideoStatus(videoId, status).finally(() => {
      setBusyId(null);
      router.refresh();
    });
  }

  function openReassign(videoId: string) {
    setReassignForId(videoId);
    setReassignTarget("");
  }

  function handleReassign(videoId: string) {
    if (!reassignTarget) return;
    setBusyId(videoId);
    adminReassignVideo(videoId, reassignTarget).finally(() => {
      setBusyId(null);
      setReassignForId(null);
      setReassignTarget("");
      router.refresh();
    });
  }

  function handleResetOnly(videoId: string) {
    setBusyId(videoId);
    adminResetVideo(videoId).finally(() => {
      setBusyId(null);
      setReassignForId(null);
      setReassignTarget("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-title text-xl font-bold text-ink">영상 검토</h1>

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
            {f.label} ({f.value ? (counts.get(f.value) ?? 0) : videos.length})
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          이상치만
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="card p-12 text-center text-sm text-muted">조건에 맞는 영상이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((v) => {
            const busy = busyId === v.id;
            return (
              <div
                key={v.id}
                className={`card flex flex-col gap-2 p-4 transition-opacity duration-150 ${
                  busy ? "opacity-50" : "opacity-100"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="chip bg-teal-soft px-2 text-[11px] font-semibold text-teal-deep">
                    {v.platform === "youtube" ? "YouTube" : "스토리룸"}
                  </span>
                  <span
                    className={`chip border px-2 text-[11px] font-semibold ${
                      v.status === "rejected"
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : "border-line text-muted"
                    }`}
                  >
                    {STATUS_LABELS[v.status]}
                  </span>
                  {v.is_flagged && <OutlierBadge />}
                  <span className="font-mono text-muted">{formatDuration(v.duration_sec)}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {v.status === "reset" &&
                      (v.reassigned_to ? (
                        <span className="chip border border-gold/40 bg-gold-soft px-2 text-[11px] font-semibold text-gold">
                          → {v.reassigned_to.display_name ?? "이름 없음"} ({v.reassigned_to.email}) 재배정
                        </span>
                      ) : (
                        <span className="chip border border-line px-2 text-[11px] font-semibold text-muted">
                          선택 계정 없음
                        </span>
                      ))}
                    <span className="font-mono text-muted">{formatDateKST(v.created_at)}</span>
                  </span>
                </div>

                <p className="text-sm font-semibold text-ink">
                  {v.status === "reset"
                    ? "초기화된 기록"
                    : (v.owner?.display_name ?? (v.owner_id ? "이름 없음" : "탈퇴한 회원"))}
                  {v.owner?.email && <span className="ml-1 font-normal text-muted">({v.owner.email})</span>}
                </p>
                {v.url && <p className="truncate text-xs text-muted">{v.url}</p>}

                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex gap-2">
                    {v.status === "active" ? (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleSetStatus(v.id, "deleted")}
                        className="chip border border-line px-3 text-[11px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "삭제"}
                      </button>
                    ) : (
                      (v.status === "deleted" || v.status === "rejected") && (
                        <>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handleSetStatus(v.id, "active")}
                            className="chip border border-line px-3 text-[11px] font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                          >
                            {busy ? "처리 중..." : "원본 계정으로 승인"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() =>
                              reassignForId === v.id ? setReassignForId(null) : openReassign(v.id)
                            }
                            className={`chip border px-3 text-[11px] font-semibold transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${
                              reassignForId === v.id
                                ? "border-gold bg-gold-soft text-gold"
                                : "border-line text-muted hover:text-ink"
                            }`}
                          >
                            다른 계정으로 승인(초기화)
                          </button>
                        </>
                      )
                    )}
                  </div>

                  {reassignForId === v.id && (
                    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-paper p-3">
                      <MemberSearchSelect members={members} value={reassignTarget} onChange={setReassignTarget} />
                      <button
                        type="button"
                        disabled={!reassignTarget || busyId !== null}
                        onClick={() => handleReassign(v.id)}
                        className="chip border border-gold bg-gold-soft px-3 text-[11px] font-semibold text-gold transition-colors duration-150 hover:bg-gold hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "선택 계정으로 승인"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleResetOnly(v.id)}
                        className="chip border border-line px-3 text-[11px] font-semibold text-muted transition-colors duration-150 hover:bg-danger/10 hover:text-danger active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "회원 선택 없이 초기화"}
                      </button>
                      <p className="w-full text-[11px] text-muted">
                        원본 기록은 초기화되어 남고, 선택한 회원 계정으로 새로 등록·승인됩니다. 회원을
                        선택하지 않고 초기화만 하면 어느 계정에도 등록되지 않습니다.
                      </p>
                    </div>
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
