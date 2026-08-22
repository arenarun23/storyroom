"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateLevel, adminUpdateLevel } from "@/app/admin/levels/actions";
import LevelBadge from "@/components/LevelBadge";
import {
  hexAlpha,
  koreanLevelName,
  noteLines,
  ruleClauses,
  summarizePromotion,
  summarizeRetention,
} from "@/lib/levelSummary";
import type { AdminLevelRule } from "@/app/admin/levels/page";
import type { Level } from "@/lib/types";

export default function LevelsClient({ levels, rules }: { levels: Level[]; rules: AdminLevelRule[] }) {
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      await adminCreateLevel(newName.trim());
      setNewName("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-title text-xl font-bold text-ink">등급 관리</h1>
        <p className="mt-1 text-sm text-muted">
          승급·유지 조건 수치는 <Link href="/admin/rules" className="text-teal-deep hover:underline">기준설정</Link>{" "}
          페이지에서 편집합니다.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {levels.map((level) => (
          <LevelCard
            key={level.code}
            level={level}
            promotionRules={rules.filter((r) => r.target_level === level.code && r.rule_type === "promotion")}
            retentionRules={rules.filter((r) => r.target_level === level.code && r.rule_type === "retention")}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 레벨 이름 (예: LEVEL 4)"
          className="input-field flex-1 px-3 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={handleCreate}
          className="chip bg-teal px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-60"
        >
          {pending ? "추가 중..." : "레벨 추가"}
        </button>
      </div>
    </div>
  );
}

function LevelCard({
  level,
  promotionRules,
  retentionRules,
  onSaved,
}: {
  level: Level;
  promotionRules: AdminLevelRule[];
  retentionRules: AdminLevelRule[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(level.name);
  const [description, setDescription] = useState(level.description ?? "");
  const [benefits, setBenefits] = useState(level.benefits ?? "");
  const [promotionNote, setPromotionNote] = useState(level.promotion_note ?? "");
  const [retentionNote, setRetentionNote] = useState(level.retention_note ?? "");
  const [fromColor, toColor] = (level.badge_color ?? "#C3CFCD,#8B9B98").split(",");
  const [colorFrom, setColorFrom] = useState(fromColor);
  const [colorTo, setColorTo] = useState(toColor);
  const [isActive, setIsActive] = useState(level.is_active);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  const kName = koreanLevelName(level.code, name);
  const softBg = hexAlpha(colorFrom, "38");
  const promotionItems = noteLines(promotionNote);
  const retentionItems = noteLines(retentionNote);

  function handleSave() {
    setToast(null);
    startTransition(async () => {
      const result = await adminUpdateLevel(level.code, {
        name,
        description: description || null,
        benefits: benefits || null,
        badge_color: `${colorFrom},${colorTo}`,
        is_active: isActive,
        promotion_note: promotionNote || null,
        retention_note: retentionNote || null,
      });
      if (!result.ok) {
        setToast({ ok: false, message: result.message ?? "저장에 실패했습니다." });
        return;
      }
      setToast({ ok: true, message: "저장되었습니다." });
      window.setTimeout(() => setToast((t) => (t?.ok ? null : t)), 2000);
      onSaved();
    });
  }

  return (
    <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
      <LevelBadge
        level={{ ...level, name, description, badge_color: `${colorFrom},${colorTo}` }}
        size="112px"
        showCaption={false}
      />

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field w-40 px-3 font-title text-lg font-bold text-ink"
          />
          <span
            className="chip border px-3 text-[11px] font-semibold"
            style={{ borderColor: colorTo, color: colorTo, backgroundColor: hexAlpha(colorFrom, "22") }}
          >
            LEVEL {level.order_no} · {kName}
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            활성
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">설명</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field px-3 text-sm"
          />
        </div>

        {promotionRules.length === 0 ? (
          <div className="rounded-[12px] p-4" style={{ backgroundColor: softBg }}>
            <p className="mb-2 text-xs font-semibold" style={{ color: colorTo }}>
              ✓ {kName} 적용 조건
            </p>
            {promotionItems.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm text-ink">
                {promotionItems.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink">별도 조건 없이 가입 즉시 자동 적용됩니다.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[12px] p-4" style={{ backgroundColor: softBg }}>
              <p className="mb-2 text-xs font-semibold" style={{ color: colorTo }}>
                ⊙ {kName} 달성 조건
              </p>
              {promotionItems.length > 0 ? (
                <ol className="flex flex-col gap-1 text-sm text-ink">
                  {promotionItems.map((line, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: colorTo }}
                      >
                        {idx + 1}
                      </span>
                      {line}
                    </li>
                  ))}
                </ol>
              ) : (
                <>
                  <ol className="flex flex-col gap-1 text-sm text-ink">
                    {promotionRules.map((r, idx) => (
                      <li key={r.id} className="flex items-start gap-2">
                        <span
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: colorTo }}
                        >
                          {idx + 1}
                        </span>
                        {ruleClauses([r])[0]}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-muted">{summarizePromotion(promotionRules, kName)}</p>
                </>
              )}
            </div>
            {(retentionRules.length > 0 || retentionItems.length > 0) && (
              <div className="rounded-[12px] border border-line p-4">
                <p className="mb-2 text-xs font-semibold text-ink">↻ {kName} 유지</p>
                {retentionItems.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm text-muted">
                    {retentionItems.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{summarizeRetention(retentionRules)}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">달성/적용 조건 문구 (줄바꿈 = 항목 1개, 비워두면 기준설정 조건으로 자동 생성)</label>
          <textarea
            value={promotionNote}
            onChange={(e) => setPromotionNote(e.target.value)}
            rows={2}
            className="input-field px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">유지 조건 문구 (줄바꿈 = 항목 1개, 비워두면 기준설정 조건으로 자동 생성)</label>
          <textarea
            value={retentionNote}
            onChange={(e) => setRetentionNote(e.target.value)}
            rows={2}
            className="input-field px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">혜택 (비어있으면 표시 안 됨)</label>
          <input
            value={benefits}
            onChange={(e) => setBenefits(e.target.value)}
            className="input-field px-3 text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">뱃지 색상 (시작)</label>
            <input type="color" value={colorFrom} onChange={(e) => setColorFrom(e.target.value)} className="h-9 w-16" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">뱃지 색상 (끝)</label>
            <input type="color" value={colorTo} onChange={(e) => setColorTo(e.target.value)} className="h-9 w-16" />
          </div>
        </div>

        <div className="relative self-start">
          <button
            type="button"
            disabled={pending}
            onClick={handleSave}
            className="chip bg-teal px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-60"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
          {toast && (
            <div
              className={`absolute left-0 top-full z-10 mt-2 whitespace-nowrap rounded-[8px] border px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-s2)] ${
                toast.ok
                  ? "border-teal/40 bg-teal-soft text-teal-deep"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              {toast.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
