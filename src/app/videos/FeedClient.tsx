"use client";

import { useState } from "react";
import FeedList from "@/app/videos/FeedList";
import type { Level, SortOption } from "@/lib/types";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "likes", label: "좋아요순" },
  { value: "comments", label: "댓글순" },
];

interface FeedClientProps {
  levels: Level[];
}

export default function FeedClient({ levels }: FeedClientProps) {
  const [sort, setSort] = useState<SortOption>("latest");
  const [levelFilter, setLevelFilter] = useState<string>("");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSort(opt.value)}
              className={`chip px-4 text-sm font-semibold ${
                sort === opt.value ? "bg-teal text-white" : "border border-line text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="input-field px-3 text-sm"
          aria-label="등급 필터"
        >
          <option value="">전체 등급</option>
          {levels.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* 정렬/필터가 바뀌면 새 key로 리마운트되어 상태가 자연스럽게 초기화된다 */}
      <FeedList key={`${sort}:${levelFilter}`} sort={sort} levelFilter={levelFilter} levels={levels} />
    </div>
  );
}
