const EXPLANATION = "같은 플랫폼 활성 영상 평균 재생시간의 3배를 초과해 자동으로 표시됩니다.";

// 네이티브 title 툴팁은 브라우저·환경에 따라 뜨지 않는 경우가 있어,
// hover/focus 시 항상 뜨는 커스텀 설명 박스로 대체한다.
export default function OutlierBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const chipClass =
    size === "md"
      ? "chip bg-gold-soft px-3 text-xs font-semibold text-gold"
      : "chip bg-gold-soft px-2 text-[11px] text-gold";

  return (
    <span className="group relative inline-flex">
      <span className={chipClass} tabIndex={0}>
        이상치
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-0 z-20 mt-2 w-56 rounded-[10px] border border-line bg-card px-3 py-2 text-xs leading-relaxed text-ink opacity-0 shadow-[var(--shadow-s2)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {EXPLANATION}
      </span>
    </span>
  );
}
