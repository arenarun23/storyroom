"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateConfig } from "@/app/admin/config/actions";
import type { AppConfigRow } from "@/lib/types";

export default function ConfigClient({ config }: { config: AppConfigRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-title text-xl font-bold text-ink">전역 설정</h1>
      <div className="flex flex-col gap-3">
        {config.map((row) => (
          <ConfigRow key={row.key} row={row} />
        ))}
      </div>
    </div>
  );
}

function ConfigRow({ row }: { row: AppConfigRow }) {
  const [value, setValue] = useState(row.value);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      const result = await adminUpdateConfig(row.key, value);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-mono text-sm font-semibold text-ink">{row.key}</p>
        {row.description && <p className="text-xs text-muted">{row.description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {row.key === "signup_approval_mode" ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} className="input-field px-3 text-sm">
            <option value="auto">auto</option>
            <option value="manual">manual</option>
          </select>
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input-field w-40 px-3 text-sm"
          />
        )}
        <button
          type="button"
          disabled={pending}
          onClick={handleSave}
          className="chip bg-teal px-4 text-xs font-semibold text-white"
        >
          저장
        </button>
        {saved && <span className="text-xs text-teal-deep">저장됨</span>}
      </div>
    </div>
  );
}
