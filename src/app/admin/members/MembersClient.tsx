"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApproval } from "@/app/admin/members/actions";
import type { Profile } from "@/lib/types";

interface MembersClientProps {
  members: Pick<Profile, "id" | "email" | "display_name" | "auth_provider" | "created_at">[];
}

export default function MembersClient({ members }: MembersClientProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === members.length ? new Set() : new Set(members.map((m) => m.id))));
  }

  function handleAction(ids: string[], status: "approved" | "rejected") {
    startTransition(async () => {
      await setApproval(ids, status);
      setSelected(new Set());
      router.refresh();
    });
  }

  if (members.length === 0) {
    return <p className="card p-12 text-center text-sm text-muted">승인 대기 중인 회원이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={selected.size === members.length} onChange={toggleAll} />
          전체 선택 ({selected.size}/{members.length})
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={selected.size === 0 || pending}
            onClick={() => handleAction([...selected], "approved")}
            className="chip bg-teal px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            선택 승인
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || pending}
            onClick={() => handleAction([...selected], "rejected")}
            className="chip border border-line px-4 text-xs font-semibold text-danger disabled:opacity-50"
          >
            선택 거부
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.id} className="card flex items-center gap-4 p-4">
            <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-semibold text-ink">{m.display_name ?? "이름 없음"}</span>
              <span className="text-xs text-muted">
                {m.email} · {m.auth_provider} · {new Date(m.created_at).toLocaleDateString("ko-KR")} 가입
              </span>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleAction([m.id], "approved")}
              className="chip bg-teal px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              승인
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleAction([m.id], "rejected")}
              className="chip border border-line px-4 text-xs font-semibold text-danger disabled:opacity-50"
            >
              거부
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
