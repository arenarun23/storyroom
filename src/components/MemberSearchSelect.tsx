"use client";

import { useMemo, useState } from "react";

interface MemberOption {
  id: string;
  display_name: string | null;
  email: string;
}

// 이름/이메일로 검색해 좁힌 뒤 선택하는 회원 선택기. 회원 수가 많아지면
// 일반 <select> 목록만으로는 찾기 어려워져 검색창을 함께 둔다.
export default function MemberSearchSelect({
  members,
  value,
  onChange,
  placeholder = "회원 선택...",
}: {
  members: MemberOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => (m.display_name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, search]);

  return (
    <div className="flex min-w-[220px] flex-1 flex-col gap-1">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="이름 또는 이메일 검색"
        className="rounded-[8px] border border-line bg-card px-2 py-1.5 text-xs text-ink"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[8px] border border-line bg-card px-2 py-1.5 text-xs text-ink"
      >
        <option value="">
          {placeholder} ({filtered.length}명)
        </option>
        {filtered.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name ?? "이름 없음"} ({m.email})
          </option>
        ))}
      </select>
    </div>
  );
}
