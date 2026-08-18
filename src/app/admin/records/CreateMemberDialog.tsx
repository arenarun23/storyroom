"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateMember } from "@/app/admin/records/actions";

export default function CreateMemberDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await adminCreateMember({ email, password, displayName });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="card flex w-full max-w-sm flex-col gap-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-title text-lg font-bold text-ink">회원 직접 등록</h2>
        <p className="text-xs text-muted">
          이메일+비밀번호로 계정을 만듭니다. 승인 대기 없이 바로 사용할 수 있습니다.
        </p>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field px-3 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">초기 비밀번호</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8자 이상"
            className="input-field px-3 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">표시 이름 (선택)</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input-field px-3 text-sm"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={handleCreate}
            className="chip bg-teal px-4 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pending ? "생성 중..." : "생성"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="chip border border-line px-4 text-xs font-semibold text-muted"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
