// §12.1 단위 테스트 대상 유틸 (parseDuration / normalizeUrl / extractYouTubeId)

const YOUTUBE_URL_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_URL_PATTERN);
  return match ? match[1] : null;
}

export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

// DB 트리거 trg_validate_video_fn의 url_key 생성 로직과 동일하게 정규화한다
// (쿼리스트링/해시 제거 → 후행 슬래시 제거 → 소문자화).
export function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

// "MM:SS" 또는 "HH:MM:SS" → 초. 형식이 잘못되면 null.
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(trimmed)) return null;

  const parts = trimmed.split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return null;

  let sec: number;
  if (parts.length === 2) {
    const [m, s] = parts;
    if (s >= 60) return null;
    sec = m * 60 + s;
  } else {
    const [h, m, s] = parts;
    if (m >= 60 || s >= 60) return null;
    sec = h * 3600 + m * 60 + s;
  }

  return sec > 0 ? sec : null;
}

export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatMinutes(totalSec: number): string {
  const minutes = Math.round(totalSec / 60);
  return `${minutes}분`;
}

// §6.3 판정 지표 한글 표기 (내 정보 진행률 게이지, 등급 안내 페이지에서 공용)
export const METRIC_LABELS: Record<string, string> = {
  video_count: "스토리룸 영상 편수",
  total_duration_min: "누적 재생시간(분)",
  yt_video_count: "유튜브 영상 편수",
  yt_views: "유튜브 누적 조회수",
  yt_likes: "유튜브 누적 좋아요",
  yt_comments: "유튜브 누적 댓글",
};

const LEVEL_ROMAN: Record<number, string> = { 0: "0", 1: "I", 2: "II", 3: "III" };

export function levelRoman(orderNo: number): string {
  return LEVEL_ROMAN[orderNo] ?? String(orderNo);
}

export function isWithinWarningWindow(targetIso: string, warnDays: number): boolean {
  const diffMs = new Date(targetIso).getTime() - Date.now();
  return diffMs > 0 && diffMs <= warnDays * 24 * 60 * 60 * 1000;
}

export function isPast(targetIso: string): boolean {
  return new Date(targetIso).getTime() <= Date.now();
}

export function formatDday(targetIso: string): string {
  const diffMs = new Date(targetIso).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "D-Day";
  return `D-${days}`;
}
