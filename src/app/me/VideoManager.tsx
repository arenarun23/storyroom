"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createVideos, deleteVideo, fillMissingOwnerNicknames, updateVideo } from "@/app/me/actions";
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
  ownerNickname: string;
  error?: string;
}

let rowSeq = 0;
function emptyRow(ownerNickname = ""): InputRow {
  rowSeq += 1;
  return { id: rowSeq, url: "", title: "", durationSec: null, manualText: "", status: "idle", ownerNickname };
}

export function VideoRegisterForm({
  disabled,
  currentLevelCode,
  defaultNickname = "",
}: {
  disabled: boolean;
  currentLevelCode: string;
  // 최근 등록한 스토리룸 영상의 닉네임. 새 입력 행에 미리 채워 넣기만 하고,
  // 여기서 바꿔도 이미 등록된 영상의 닉네임은 건드리지 않는다.
  defaultNickname?: string;
}) {
  const [rows, setRows] = useState<InputRow[]>([emptyRow(defaultNickname)]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateRow(id: number, patch: Partial<InputRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) =>
      prev.length >= MAX_ROWS
        ? prev
        // 새 행에는 직전 행에 적은 닉네임을 이어서 채운다(같은 사람이 여러 편을
        // 연달아 등록하는 경우가 대부분).
        : [...prev, emptyRow(prev[prev.length - 1]?.ownerNickname || defaultNickname)],
    );
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

  // 스토리룸 영상은 등급 무관 항상, 유튜브 영상은 크리에이터(마스터 승급
  // 대상)일 때만 닉네임/채널 입력란을 보여준다(§ 본인 소유 확인).
  function showsNickname(url: string) {
    return !extractYouTubeId(url.trim()) || currentLevelCode === "L2";
  }
  function nicknamePlaceholder(url: string) {
    return extractYouTubeId(url.trim()) ? "유튜브 채널 또는 닉네임" : "스토리룸 닉네임";
  }

  function handleSubmit() {
    setFormMessage(null);

    const filled = rows.filter((r) => r.url.trim().length > 0);
    if (filled.length === 0) {
      setFormMessage("등록할 영상을 입력해 주세요.");
      return;
    }

    const missingNickname = filled.filter((r) => showsNickname(r.url) && !r.ownerNickname.trim());
    if (missingNickname.length > 0) {
      const missingIds = missingNickname.map((r) => r.id);
      setRows((prev) =>
        prev.map((r) =>
          missingIds.includes(r.id)
            ? { ...r, error: extractYouTubeId(r.url.trim()) ? "유튜브 채널 또는 닉네임을 입력해 주세요" : "스토리룸 닉네임을 입력해 주세요" }
            : r,
        ),
      );
      return;
    }

    startTransition(async () => {
      const result = await createVideos(
        filled.map((r) => ({
          url: r.url,
          title: r.title.trim() || null,
          durationSec: r.durationSec,
          durationSource: (r.status === "auto" ? "auto" : "manual") as DurationSource,
          ownerNickname: r.ownerNickname.trim() || null,
        })),
      );

      if (result.ok) {
        setRows([emptyRow(filled[filled.length - 1]?.ownerNickname.trim() || defaultNickname)]);
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
    <section className="card flex flex-col gap-4 p-6">
      <h2 className="font-title text-lg font-bold text-ink">영상 등록</h2>
      {!disabled && defaultNickname && (
        <p className="text-xs text-muted">
          스토리룸 닉네임은 최근 등록값(<span className="font-semibold text-ink">{defaultNickname}</span>)으로 미리
          채워집니다. 닉네임이 바뀌었으면 여기서 새 닉네임으로 고쳐 주세요. 이미 등록된 영상의 닉네임은 그대로
          유지됩니다.
        </p>
      )}

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

                {showsNickname(row.url) && (
                  <input
                    type="text"
                    placeholder={nicknamePlaceholder(row.url)}
                    value={row.ownerNickname}
                    onChange={(e) => updateRow(row.id, { ownerNickname: e.target.value })}
                    className="input-field px-4 text-sm sm:w-40"
                    aria-label={`${nicknamePlaceholder(row.url)} ${i + 1}`}
                  />
                )}

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
  );
}

// 소유 확인용 닉네임이 필요한 영상인지 판단한다. 스토리룸 영상은 등급 무관 항상
// 필요하고, 유튜브 영상은 등록 폼과 같은 기준(크리에이터만)이라 여기서는 제외한다.
function needsNickname(video: Video) {
  return video.platform === "storyroom" && video.status !== "deleted" && !video.owner_nickname?.trim();
}

export function VideoList({ videos }: { videos: Video[] }) {
  const missing = videos.filter(needsNickname);
  const [promptOpen, setPromptOpen] = useState(missing.length > 0);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-title text-lg font-bold text-ink">내 영상 목록</h2>

      {missing.length > 0 && (
        <div className="banner flex flex-col gap-2 bg-gold-soft px-4 py-3 text-sm text-gold sm:flex-row sm:items-center sm:justify-between">
          <span>
            스토리룸 닉네임이 입력되지 않은 영상이 {missing.length}편 있습니다. 본인 소유 확인을 위해 입력해 주세요.
          </span>
          <button
            type="button"
            onClick={() => setPromptOpen(true)}
            className="chip shrink-0 bg-gold px-4 text-xs font-semibold text-white transition-colors duration-150 hover:opacity-90 active:scale-95"
          >
            일괄 입력
          </button>
        </div>
      )}

      {promptOpen && missing.length > 0 && (
        <NicknamePrompt missingCount={missing.length} onClose={() => setPromptOpen(false)} />
      )}

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
  );
}

// 닉네임 미입력 영상이 있을 때 목록 위에 뜨는 모달. 한 번 입력하면 비어 있는
// 스토리룸 영상 전체에 같은 값을 채운다(fillMissingOwnerNicknames).
function NicknamePrompt({ missingCount, onClose }: { missingCount: number; onClose: () => void }) {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    const value = nickname.trim();
    if (!value) {
      setError("스토리룸 닉네임을 입력해 주세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await fillMissingOwnerNicknames(value);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nickname-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
    >
      <div className="card flex w-full max-w-md flex-col gap-4 p-6">
        <h3 id="nickname-prompt-title" className="font-title text-lg font-bold text-ink">
          스토리룸 닉네임을 입력해 주세요
        </h3>
        <p className="text-sm text-muted">
          닉네임이 입력되지 않은 영상이 {missingCount}편 있습니다. 아래에 입력하면{" "}
          <span className="font-semibold text-ink">이 {missingCount}편에만</span> 적용되고, 이미 닉네임이 들어 있는
          영상은 그대로 유지됩니다. 영상마다 다르게 넣어야 하면 목록에서 개별 수정도 가능합니다.
        </p>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          placeholder="스토리룸 닉네임"
          autoFocus
          className="input-field px-4 text-sm"
          aria-label="스토리룸 닉네임"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="chip border border-line px-4 text-xs font-semibold text-muted transition-colors duration-150 hover:bg-teal-soft hover:text-ink active:scale-95"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="chip bg-teal px-5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-50"
          >
            {pending ? "저장 중..." : "전체 적용"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoRow({ video }: { video: Video }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(video.url ?? "");
  const [title, setTitle] = useState(video.title ?? "");
  const [titleDraft, setTitleDraft] = useState("");
  const [durationText, setDurationText] = useState(formatDuration(video.duration_sec));
  const [nickname, setNickname] = useState(video.owner_nickname ?? "");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const nicknameMissing = needsNickname(video);

  function handleSaveNickname() {
    const value = nicknameDraft.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      const result = await updateVideo(video.id, { ownerNickname: value });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function handleSave() {
    setError(null);
    const durationSec = parseDuration(durationText);
    if (durationSec === null) {
      setError("MM:SS 형식으로 입력해 주세요");
      return;
    }
    if (video.platform === "storyroom" && !nickname.trim()) {
      setError("스토리룸 닉네임을 입력해 주세요");
      return;
    }

    startTransition(async () => {
      const result = await updateVideo(video.id, {
        url,
        title: title.trim() || null,
        durationSec,
        ...(video.platform === "storyroom" ? { ownerNickname: nickname.trim() } : {}),
      });
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
          {video.platform === "storyroom" && (
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="스토리룸 닉네임"
              className="input-field px-3 text-sm sm:w-40"
              aria-label="스토리룸 닉네임"
            />
          )}
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
          {video.platform === "storyroom" &&
            (nicknameMissing ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveNickname();
                  }}
                  placeholder="스토리룸 닉네임 입력"
                  className="input-field h-7 w-40 px-2 text-xs"
                  aria-label="스토리룸 닉네임"
                />
                <button
                  type="button"
                  disabled={!nicknameDraft.trim() || pending}
                  onClick={handleSaveNickname}
                  className="chip border border-line px-2 text-[11px] font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  {pending ? "저장 중..." : "저장"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">스토리룸 닉네임: {video.owner_nickname}</p>
            ))}
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
