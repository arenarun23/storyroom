"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminReassignVideo,
  adminResetVideo,
  adminSetVideoStatus,
  adminUpdateVideoInfo,
} from "@/app/admin/records/actions";
import { formatDateKST, formatDuration, parseDuration } from "@/lib/format";
import MemberSearchSelect from "@/components/MemberSearchSelect";
import OutlierBadge from "@/components/OutlierBadge";

export interface AdminVideoRow {
  id: string;
  owner_id: string | null;
  platform: "storyroom" | "youtube";
  title: string | null;
  url: string | null;
  duration_sec: number;
  status: "active" | "pending" | "rejected" | "deleted" | "withdrawn" | "reset";
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
  pending: "승인 대기",
  rejected: "거절",
  deleted: "삭제됨",
  withdrawn: "탈퇴 회원",
  reset: "초기화됨",
};

const STATUS_FILTERS: { value: "" | AdminVideoRow["status"]; label: string }[] = [
  { value: "", label: "전체" },
  { value: "pending", label: "승인 대기" },
  { value: "active", label: "활성" },
  { value: "deleted", label: "삭제됨" },
  { value: "withdrawn", label: "탈퇴 회원" },
  { value: "reset", label: "초기화됨" },
  { value: "rejected", label: "거절" },
];

export default function VideoReviewClient({
  videos,
  members,
}: {
  videos: AdminVideoRow[];
  members: AdminMemberOption[];
}) {
  const [statusFilter, setStatusFilter] = useState<"" | AdminVideoRow["status"]>("");
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

  function handleSetStatus(videoId: string, status: "active" | "deleted" | "rejected") {
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
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              members={members}
              busy={busyId === v.id}
              busyId={busyId}
              reassignOpen={reassignForId === v.id}
              reassignTarget={reassignTarget}
              onToggleReassign={() => (reassignForId === v.id ? setReassignForId(null) : openReassign(v.id))}
              onReassignTargetChange={setReassignTarget}
              onSetStatus={(status) => handleSetStatus(v.id, status)}
              onReassign={() => handleReassign(v.id)}
              onResetOnly={() => handleResetOnly(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({
  video: v,
  members,
  busy,
  busyId,
  reassignOpen,
  reassignTarget,
  onToggleReassign,
  onReassignTargetChange,
  onSetStatus,
  onReassign,
  onResetOnly,
}: {
  video: AdminVideoRow;
  members: AdminMemberOption[];
  busy: boolean;
  busyId: string | null;
  reassignOpen: boolean;
  reassignTarget: string;
  onToggleReassign: () => void;
  onReassignTargetChange: (v: string) => void;
  onSetStatus: (status: "active" | "deleted" | "rejected") => void;
  onReassign: () => void;
  onResetOnly: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(v.title ?? "");
  const [url, setUrl] = useState(v.url ?? "");
  const [durationText, setDurationText] = useState(formatDuration(v.duration_sec));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleEditToggle() {
    if (!editing) {
      setTitle(v.title ?? "");
      setUrl(v.url ?? "");
      setDurationText(formatDuration(v.duration_sec));
      setError(null);
    }
    setEditing((e) => !e);
  }

  function handleSaveInfo() {
    const durationSec = parseDuration(durationText);
    if (durationSec === null) {
      setError("MM:SS 형식으로 입력해 주세요");
      return;
    }
    setError(null);
    setSaving(true);
    adminUpdateVideoInfo(v.id, { title: title.trim() || null, url, durationSec })
      .then((result) => {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setEditing(false);
        router.refresh();
      })
      .finally(() => setSaving(false));
  }

  return (
    <div
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
              : v.status === "pending"
                ? "border-gold/40 bg-gold-soft text-gold"
                : "border-line text-muted"
          }`}
        >
          {STATUS_LABELS[v.status]}
        </span>
        {v.is_flagged && <OutlierBadge />}
        {!editing && <span className="font-mono text-muted">{formatDuration(v.duration_sec)}</span>}
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

      {editing ? (
        <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-paper p-3 sm:flex-row sm:items-start">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (선택)"
            className="input-field flex-1 px-3 text-sm"
            aria-label="영상 제목"
          />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="영상 링크 (https://...)"
            className="input-field flex-[2] px-3 text-sm"
            aria-label="영상 링크"
          />
          <input
            type="text"
            value={durationText}
            onChange={(e) => setDurationText(e.target.value)}
            placeholder="MM:SS"
            className="input-field w-28 px-3 font-mono text-sm"
            aria-label="재생시간"
          />
        </div>
      ) : (
        <>
          {v.title && <p className="text-sm text-ink">{v.title}</p>}
          {v.url && (
            <a
              href={v.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-muted hover:text-teal-deep hover:underline"
            >
              {v.url}
            </a>
          )}
        </>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-col gap-2 pt-1">
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveInfo}
                className="chip bg-teal px-3 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleEditToggle}
                className="chip border border-line px-3 text-[11px] font-semibold text-muted transition-colors duration-150 hover:bg-teal-soft hover:text-ink active:scale-95"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busyId !== null}
              onClick={handleEditToggle}
              className="chip border border-line px-3 text-[11px] font-semibold text-ink transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              수정
            </button>
          )}

          {v.status === "active" ? (
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => onSetStatus("deleted")}
              className="chip border border-line px-3 text-[11px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? "처리 중..." : "삭제"}
            </button>
          ) : v.status === "pending" ? (
            <>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => onSetStatus("active")}
                className="chip border border-line px-3 text-[11px] font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {busy ? "처리 중..." : "승인"}
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => onSetStatus("rejected")}
                className="chip border border-line px-3 text-[11px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {busy ? "처리 중..." : "거절"}
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={onToggleReassign}
                className={`chip border px-3 text-[11px] font-semibold transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${
                  reassignOpen ? "border-gold bg-gold-soft text-gold" : "border-line text-muted hover:text-ink"
                }`}
              >
                다른 계정으로 승인(초기화)
              </button>
            </>
          ) : (
            (v.status === "deleted" || v.status === "rejected") && (
              <>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => onSetStatus("active")}
                  className="chip border border-line px-3 text-[11px] font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  {busy ? "처리 중..." : "원본 계정으로 승인"}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={onToggleReassign}
                  className={`chip border px-3 text-[11px] font-semibold transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${
                    reassignOpen ? "border-gold bg-gold-soft text-gold" : "border-line text-muted hover:text-ink"
                  }`}
                >
                  다른 계정으로 승인(초기화)
                </button>
              </>
            )
          )}
        </div>

        {reassignOpen && (
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-paper p-3">
            <MemberSearchSelect members={members} value={reassignTarget} onChange={onReassignTargetChange} />
            <button
              type="button"
              disabled={!reassignTarget || busyId !== null}
              onClick={onReassign}
              className="chip border border-gold bg-gold-soft px-3 text-[11px] font-semibold text-gold transition-colors duration-150 hover:bg-gold hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? "처리 중..." : "선택 계정으로 승인"}
            </button>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={onResetOnly}
              className="chip border border-line px-3 text-[11px] font-semibold text-muted transition-colors duration-150 hover:bg-danger/10 hover:text-danger active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? "처리 중..." : "회원 선택 없이 초기화"}
            </button>
            <p className="w-full text-[11px] text-muted">
              원본 기록은 초기화되어 남고, 선택한 회원 계정으로 새로 등록·승인됩니다. 회원을 선택하지 않고
              초기화만 하면 어느 계정에도 등록되지 않습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
