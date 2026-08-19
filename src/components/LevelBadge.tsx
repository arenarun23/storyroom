import { levelRoman } from "@/lib/format";
import type { Level } from "@/lib/types";

const HEX_POINTS =
  "100,15 173.6,57.5 173.6,142.5 100,185 26.4,142.5 26.4,57.5";
const HEX_VERTICES: [number, number][] = [
  [100, 15],
  [173.6, 57.5],
  [173.6, 142.5],
  [100, 185],
  [26.4, 142.5],
  [26.4, 57.5],
];

interface LevelBadgeProps {
  level: Pick<Level, "code" | "order_no" | "name" | "badge_color" | "badge_image_url">;
  /** 0~1. 지정하면 다음 등급까지의 진행률 링을 표시한다 */
  progress?: number;
  /** CSS 길이. 기본값은 §4.3 반응형 규격 clamp(140px, 20vw, 220px) */
  size?: string;
  showCaption?: boolean;
}

// §5.3 등급 뱃지 규격: 육각 플레이트 + 그라디언트, 흰색 반투명 내부 테두리,
// 꼭짓점 6개 스터드, 좌상단 대각 시닝(screen 블렌드), drop-shadow, 진행률 링.
export default function LevelBadge({
  level,
  progress,
  size = "clamp(140px, 20vw, 220px)",
  showCaption = true,
}: LevelBadgeProps) {
  const [fromColor, toColor] = (level.badge_color ?? "#C3CFCD,#8B9B98").split(",");
  const gradId = `badge-grad-${level.code}`;

  const circumference = 2 * Math.PI * 95;
  const clamped = progress != null ? Math.min(Math.max(progress, 0), 1) : 0;
  const dash = circumference * clamped;

  if (level.badge_image_url) {
    return (
      <div
        role="img"
        aria-label={`${level.name} 등급 뱃지`}
        style={{ width: size, height: size, filter: "drop-shadow(0 4px 6px rgba(12,29,27,.26))" }}
        className="relative shrink-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={level.badge_image_url} alt="" className="h-full w-full object-contain" />
        {progress != null && (
          <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
            <circle cx="100" cy="100" r="97" fill="none" stroke="var(--line)" strokeWidth="6" />
            <circle
              cx="100"
              cy="100"
              r="97"
              fill="none"
              stroke="var(--teal)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash * (97 / 95)} ${circumference * (97 / 95)}`}
              transform="rotate(-90 100 100)"
            />
          </svg>
        )}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`${level.name} 등급 뱃지`}
      style={{ width: size, height: size, filter: "drop-shadow(0 4px 6px rgba(12,29,27,.26))" }}
      className="relative shrink-0"
    >
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>

        {progress != null && (
          <>
            <circle cx="100" cy="100" r="95" fill="none" stroke="var(--line)" strokeWidth="6" />
            <circle
              cx="100"
              cy="100"
              r="95"
              fill="none"
              stroke="var(--teal)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 100 100)"
            />
          </>
        )}

        <polygon points={HEX_POINTS} fill={`url(#${gradId})`} />
        <polygon
          points={HEX_POINTS}
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="2"
          transform="translate(100 100) scale(0.92) translate(-100 -100)"
        />
        {HEX_VERTICES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill="rgba(255,255,255,0.55)" />
        ))}
        <polygon
          points="30,60 100,15 100,70 55,95"
          fill="white"
          opacity="0.25"
          style={{ mixBlendMode: "screen" }}
        />
        <text
          x="100"
          y="108"
          textAnchor="middle"
          fontSize="54"
          fontWeight="900"
          fill="white"
          style={{ fontFamily: "var(--font-noto-serif-kr), serif" }}
        >
          {levelRoman(level.order_no)}
        </text>
        {showCaption && (
          <text
            x="100"
            y="136"
            textAnchor="middle"
            fontSize="13"
            letterSpacing="2"
            fill="rgba(255,255,255,0.88)"
            style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
          >
            {level.name}
          </text>
        )}
      </svg>
    </div>
  );
}
