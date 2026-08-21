"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateLevel, adminUpdateLevel } from "@/app/admin/levels/actions";
import LevelBadge from "@/components/LevelBadge";
import type { Level } from "@/lib/types";

export default function LevelsClient({ levels }: { levels: Level[] }) {
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
      <h1 className="font-title text-xl font-bold text-ink">등급 관리</h1>

      <div className="flex flex-col gap-4">
        {levels.map((level) => (
          <LevelCard key={level.code} level={level} onSaved={() => router.refresh()} />
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

function LevelCard({ level, onSaved }: { level: Level; onSaved: () => void }) {
  const [name, setName] = useState(level.name);
  const [description, setDescription] = useState(level.description ?? "");
  const [benefits, setBenefits] = useState(level.benefits ?? "");
  const [fromColor, toColor] = (level.badge_color ?? "#C3CFCD,#8B9B98").split(",");
  const [colorFrom, setColorFrom] = useState(fromColor);
  const [colorTo, setColorTo] = useState(toColor);
  const [isActive, setIsActive] = useState(level.is_active);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  function handleSave() {
    setToast(null);
    startTransition(async () => {
      const result = await adminUpdateLevel(level.code, {
        name,
        description: description || null,
        benefits: benefits || null,
        badge_color: `${colorFrom},${colorTo}`,
        is_active: isActive,
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
    <div className="card flex flex-col gap-4 p-6 sm:flex-row">
      <LevelBadge
        level={{ ...level, name, description, badge_color: `${colorFrom},${colorTo}` }}
        size="88px"
        showCaption={false}
      />

      <div className="flex flex-1 flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">표시 이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-field px-3 text-sm" />
          </div>
          <div className="flex items-center gap-3 pt-5">
            <label className="flex items-center gap-1.5 text-xs text-ink">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              활성
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">설명</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field px-3 text-sm"
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
