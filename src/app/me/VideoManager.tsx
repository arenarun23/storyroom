"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createVideos, deleteVideo, updateVideo } from "@/app/me/actions";
import { extractYouTubeId, formatDuration, parseDuration } from "@/lib/format";
import type { DurationSource, Video } from "@/lib/types";
import OutlierBadge from "@/components/OutlierBadge";

const MAX_ROWS = 10;
const DETECT_TIMEOUT_MS = 3000;

const VIDEO_STATUS_LABEL: Partial<Record<Video["status"], string>> = {
  active: "승인됨",
  pending: "승인 대기",
  rejected: "거절됨",
};

const VIDEO_STATUS_CLASS: Partial<Record<Video["status"], string>> = {
  active: "border-teal/40 bg-teal-soft text-teal-deep",
  pending: "border-gold/40 bg-gold-soft text-gold",
  rejected: "border-danger/40 bg-danger/10 text-danger",
};

type RowStatus = "idle" | "detecting" | "auto" | "manual";

interface InputRow {
  id: number;
  url: string;
  title: string;
  durationSec: number | null;
  manualText: string;
  status: RowStatus;
  error?: string;
}

let rowSeq = 0;
function emptyRow(): InputRow {
  rowSeq += 1;
  return { id: rowSeq, url: "", title: "", durationSec: null, manualText: "", status: "idle" };
}

interface VideoManagerProps {
  videos: Video[];
  disabled: boolean;
}

export default function VideoManager({ videos, disabled }: VideoManagerProps) {
  const [rows, setRows] = useState<InputRow[]>([emptyRow()]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateRow(id: number, patch: Partial<InputRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, emptyRow()]));
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  // §4.3 영상 입력 상호작용: blur 시 <video preload="metadata">로 재생시간 자동 추출,
  // 3초 내 응답 없으면 수동 입력으로 전환. 유튜브 링크는 즉시 수동 전환.
  function handleUrlBlur(id: number, rawUrl: string) {
    const url = rawUrl.trim();
    if (!url) return;

    if (extractYouTubeId(url)) {
      updateRow(id, { status: "manual", durationSec: null, error: undefined });
      return;
    }

    updateRow(id, { status: "detecting", error: undefined });

    const probe = document.createElement("video");
    probe.preload = "metadata";
    let settled = false;

    const finishManual = () => {
      if (settled) return;
      settled = true;
      updateRow(id, {
        status: "manual",
        durationSec: null,
        error: "재생시간을 자동으로 읽지 못했습니다. 직접 입력해 주세요.",
      });
    };

    const timer = window.setTimeout(finishManual, DETECT_TIMEOUT_MS);

    probe.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      updateRow(id, {
        status: "auto",
        durationSec: Math.round(probe.duration),
        error: undefined,
      });
    };

    probe.onerror = () => {
      window.clearTimeout(timer);
      finishManual();
    };

    probe.src = url;
  }

  function handleManualDuration(id: number, text: string) {
    const sec = parseDuration(text);
    updateRow(id, {
      manualText: text,
      durationSec: sec,
      error: text && sec === null ? "MM:SS 형식으로 입력해 주세요" : undefined,
    });
  }

  function handleSubmit() {
    setFormMessage(null);

    const filled = rows.filter((r) => r.url.trim().length > 0);
    if (filled.length === 0) {
      setFormMessage("등록할 영상을 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      const result = await createVideos(
        filled.map((r) => ({
          url: r.url,
          title: r.title.trim() || null,
          durationSec: r.durationSec,
          durationSource: (r.status === "auto" ? "auto" : "manual") as DurationSource,
        })),
      );

      if (result.ok) {
        setRows([emptyRow()]);
        router.refresh();
        return;
      }

      if (result.rowErrors) {
        const filledIds = filled.map((r) => r.id);
        setRows((prev) =>
          prev.map((r) => {
            const idx = filledIds.indexOf(r.id);
            return idx >= 0 && result.rowErrors?.[idx] ? { ...r, error: result.rowErrors[idx] } : r;
          }),
        );
      }
      if (result.message) setFormMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="card flex flex-col gap-4 p-6">
        <h2 className="font-title text-lg font-bold text-ink">영상 등록</h2>

        {disabled ? (
          <p className="banner bg-gold-soft px-4 py-3 text-sm text-gold">
            승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {rows.map((row, i) => (
                <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <input
                    type="text"
                    placeholder="영상 링크 (https://...)"
                    value={row.url}
                    onChange={(e) => updateRow(row.id, { url: e.target.value })}
                    onBlur={(e) => handleUrlBlur(row.id, e.target.value)}
                    className="input-field flex-1 px-4 text-sm"
                    aria-label={`영상 링크 ${i + 1}`}
                  />

                  <input
                    type="text"
                    placeholder="제목 (선택)"
                    value={row.title}
                    onChange={(e) => updateRow(row.id, { title: e.target.value })}
                    className="input-field px-4 text-sm sm:w-40"
                    aria-label={`영상 제목 ${i + 1}`}
                  />

                  <div className="flex items-center gap-2 sm:w-48">
                    {row.status === "auto" ? (
                      <div className="input-field flex flex-1 items-center justify-between bg-teal-soft px-3">
                        <span className="font-mono text-sm text-teal-deep">
                          {row.durationSec != null ? formatDuration(row.durationSec) : "--:--"}
                        </span>
                        <span className="chip bg-teal px-2 text-[11px] font-semibold text-white">자동</span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder={row.status === "detecting" ? "확인 중..." : "MM:SS"}
                        value={row.manualText}
                        disabled={row.status === "detecting"}
                        onChange={(e) => handleManualDuration(row.id, e.target.value)}
                        className="input-field flex-1 px-3 font-mono text-sm"
                        aria-label={`재생시간 ${i + 1}`}
                      />
                    )}

                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-danger"
                        aria-label="입력 행 삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {row.error && <p className="text-xs text-danger sm:hidden">{row.error}</p>}
                </div>
              ))}
            </div>

            {rows.some((r) => r.error) && (
              <ul className="hidden flex-col gap-1 sm:flex">
                {rows.map(
                  (r, i) =>
                    r.error && (
                      <li key={r.id} className="text-xs text-danger">
                        {i + 1}번째 줄: {r.error}
                      </li>
                    ),
                )}
              </ul>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= MAX_ROWS}
                className="text-sm font-medium text-teal-deep disabled:text-muted"
              >
                + 추가 입력
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                className="btn rounded-[10px] bg-teal px-6 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "저장 중..." : "저장"}
              </button>
            </div>

            {formMessage && <p className="text-sm text-danger">{formMessage}</p>}
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-title text-lg font-bold text-ink">내 영상 목록</h2>
        {videos.length === 0 ? (
          <p className="card p-6 text-center text-sm text-muted">아직 등록한 영상이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {videos.map((video) => (
              <VideoRow key={video.id} video={video} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function VideoRow({ video }: { video: Video }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(video.url ?? "");
  const [title, setTitle] = useState(video.title ?? "");
  const [titleDraft, setTitleDraft] = useState("");
  const [durationText, setDurationText] = useState(formatDuration(video.duration_sec));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    const durationSec = parseDuration(durationText);
    if (durationSec === null) {
      setError("MM:SS 형식으로 입력해 주세요");
      return;
    }

    startTransition(async () => {
      const result = await updateVideo(video.id, { url, title: title.trim() || null, durationSec });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleSaveTitle() {
    if (!titleDraft.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await updateVideo(video.id, { title: titleDraft.trim() });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm("이 영상을 삭제할까요?")) return;
    startTransition(async () => {
      await deleteVideo(video.id);
      router.refresh();
    });
  }

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      {editing ? (
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input-field flex-1 px-3 text-sm"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (선택)"
            className="input-field px-3 text-sm sm:w-40"
          />
          <input
            value={durationText}
            onChange={(e) => setDurationText(e.target.value)}
            className="input-field w-28 px-3 font-mono text-sm"
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`chip px-3 text-xs font-semibold ${
                video.platform === "youtube" ? "bg-youtube-soft text-youtube" : "bg-teal-soft text-teal-deep"
              }`}
            >
              {video.platform === "youtube" ? "YouTube" : "스토리룸"}
            </span>
            <span
              className={`chip border px-3 text-xs font-semibold ${VIDEO_STATUS_CLASS[video.status] ?? "border-line text-muted"}`}
            >
              {VIDEO_STATUS_LABEL[video.status] ?? video.status}
            </span>
            {video.is_flagged && <OutlierBadge size="md" />}
            <span className="font-mono text-sm text-ink">{formatDuration(video.duration_sec)}</span>
            {video.title ? (
              <span className="text-sm font-medium text-ink">{video.title}</span>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="제목 입력"
                  className="input-field h-7 w-32 px-2 text-xs"
                />
                <button
                  type="button"
                  disabled={!titleDraft.trim() || pending}
                  onClick={handleSaveTitle}
                  className="chip border border-line px-2 text-[11px] font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  {pending ? "저장 중..." : "저장"}
                </button>
              </div>
            )}
          </div>
          <a
            href={video.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm text-muted hover:text-teal-deep"
          >
            {video.url}
          </a>
        </div>
      )}

      <div className="flex shrink-0 gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="chip bg-teal px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {pending ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="chip border border-line px-4 text-xs font-semibold text-muted transition-colors duration-150 hover:bg-teal-soft hover:text-ink active:scale-95"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="chip border border-line px-4 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-teal-soft active:scale-95"
            >
              수정
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="chip border border-line px-4 text-xs font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {pending ? "처리 중..." : "삭제"}
            </button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
