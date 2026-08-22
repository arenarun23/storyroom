// 등급 안내/등급관리 페이지에서 공용으로 쓰는 조건 요약 텍스트 생성기.
// level_rules의 원시 metric_key/threshold 값을 사람이 읽을 문장·짧은
// 라벨로 바꿔준다.

import { METRIC_LABELS } from "@/lib/format";

export interface LevelRuleLite {
  metric_key: string;
  operator: string;
  threshold: number;
}

// 코드에 매핑된 한글 등급명이 없으면(새로 추가한 레벨 등) 표시 이름을 그대로 쓴다.
const KOREAN_LEVEL_NAME: Record<string, string> = {
  L0: "스타터",
  L1: "비기너",
  L2: "크리에이터",
  L3: "마스터",
};

export function koreanLevelName(code: string, fallback: string): string {
  return KOREAN_LEVEL_NAME[code] ?? fallback;
}

// "#RRGGBB" + 8비트 알파(16진 두 자리)를 이어붙여 반투명 배경색을 만든다.
// 등급 카드의 박스 배경을 badge_color에서 뽑아낸 옅은 색으로 칠할 때 쓴다.
export function hexAlpha(hex: string, alphaHex: string): string {
  return `${hex}${alphaHex}`;
}

// 스텝퍼용 짧은 요약: "3편 · 3분", 조건이 없으면 "가입 즉시"
export function summarizeStepper(rules: LevelRuleLite[]): string {
  if (rules.length === 0) return "가입 즉시";
  return rules.map(shortMetricLabel).join(" · ");
}

function shortMetricLabel(r: LevelRuleLite): string {
  switch (r.metric_key) {
    case "video_count":
      return `${r.threshold}편`;
    case "total_duration_min":
      return `${r.threshold}분`;
    case "yt_video_count":
      return `YT ${r.threshold}편`;
    default:
      return `${METRIC_LABELS[r.metric_key] ?? r.metric_key} ${r.threshold}`;
  }
}

// 한글 종성(받침) 유무에 따라 조사를 고른다. 완성형 한글이 아니면(영문/숫자 등)
// 받침이 있는 쪽을 기본값으로 쓴다.
function hasBatchim(text: string): boolean {
  const ch = text.trim().at(-1);
  if (!ch) return true;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return true;
  return (code - 0xac00) % 28 !== 0;
}

function josa(text: string, withBatchim: string, withoutBatchim: string): string {
  return hasBatchim(text) ? withBatchim : withoutBatchim;
}

// 절 목록을 "A, B과 C" / "A와 B" 형태의 한 문장으로 잇는다(조사는 마지막
// 바로 앞 절의 받침 유무에 맞춘다).
function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? "";
  const allButLast = clauses.slice(0, -1);
  const lastClause = clauses.at(-1)!;
  const connector = josa(allButLast.at(-1)!, "과", "와");
  return allButLast.join(", ") + connector + " " + lastClause;
}

function operatorLabel(operator: string): string {
  switch (operator) {
    case ">=":
      return "이상";
    case ">":
      return "초과";
    case "<=":
      return "이하";
    case "<":
      return "미만";
    case "=":
    case "==":
      return "";
    default:
      return operator;
  }
}

// 조건 목록을 사람이 읽는 절 단위로("스토리룸 영상 편수 10 이상") 반환
export function ruleClauses(rules: LevelRuleLite[]): string[] {
  return rules.map((r) => {
    const op = operatorLabel(r.operator);
    return `${METRIC_LABELS[r.metric_key] ?? r.metric_key} ${r.threshold}${op ? " " + op : ""}`;
  });
}

// 승급 조건 요약 문장
export function summarizePromotion(rules: LevelRuleLite[], levelName: string): string {
  if (rules.length === 0) return "";
  const joined = joinClauses(ruleClauses(rules));
  const suffix = josa(levelName, "으로", "로");
  return `${joined} 조건을 모두 충족하면 ${levelName}${suffix} 승급합니다.`;
}

// 유지 조건 요약 문장
export function summarizeRetention(rules: LevelRuleLite[]): string {
  if (rules.length === 0) return "";
  const joined = joinClauses(ruleClauses(rules));
  return `정해진 최근 활동 기간 안에 ${joined} 조건을 충족해야 합니다.`;
}

// 관리자가 직접 쓴 문구(줄바꿈 = 항목 하나)를 항목 배열로 바꾼다.
// 빈 줄은 건너뛴다.
export function noteLines(note: string | null | undefined): string[] {
  if (!note) return [];
  return note
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
