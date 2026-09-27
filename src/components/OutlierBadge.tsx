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
        // 숨김 상태에서도 레이아웃에 잡히면 모바일에서 페이지 폭이 넓어지므로 hidden으로 완전히 뺀다.
        className="pointer-events-none absolute top-full left-0 z-20 mt-2 hidden w-56 max-w-[calc(100vw-2rem)] rounded-[10px] border border-line bg-card px-3 py-2 text-xs leading-relaxed text-ink shadow-[var(--shadow-s2)] group-hover:block group-focus-within:block"
      >
        {EXPLANATION}
      </span>
    </span>
  );
}
