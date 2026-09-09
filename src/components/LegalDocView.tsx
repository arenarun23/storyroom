import { OPERATOR, type LegalDoc } from "@/lib/legal";

// 이용약관 / 개인정보 동의 본문 렌더러. /terms, /privacy 두 페이지가 함께 쓴다.
export default function LegalDocView({ doc }: { doc: LegalDoc }) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-title text-xl font-bold text-ink sm:text-2xl">{doc.title}</h1>
        {doc.subtitle && <p className="text-sm font-semibold text-teal-deep">{doc.subtitle}</p>}
        <p className="text-xs text-muted">시행일 {OPERATOR.effectiveDate}</p>
      </header>

      {doc.blocks.map((block, i) => (
        <section key={block.heading ?? i} className="flex flex-col gap-2">
          {block.heading && <h2 className="font-title text-base font-bold text-ink">{block.heading}</h2>}
          {block.paragraphs?.map((p) => (
            <p key={p} className="text-sm leading-relaxed text-ink/80">
              {p}
            </p>
          ))}
          {block.items && block.items.length > 0 && (
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              {block.items.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-ink/80">
                  {item}
                </li>
              ))}
            </ul>
          )}
          {block.note && <p className="text-xs leading-relaxed text-muted">{block.note}</p>}
        </section>
      ))}
    </article>
  );
}
