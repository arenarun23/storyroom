"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { withdrawAccount } from "@/app/me/withdraw/actions";

interface WithdrawFormProps {
  email: string;
}

// FR-901~903: 경고 문구 + 삭제 대상 명시 + 본인 이메일 재입력 확인
export default function WithdrawForm({ email }: WithdrawFormProps) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleWithdraw() {
    setError(null);
    startTransition(async () => {
      const result = await withdrawAccount(confirmEmail);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <h1 className="font-title text-xl font-bold text-ink">회원 탈퇴</h1>

      <p className="banner border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        사용자님의 개인정보는 탈퇴 즉시 삭제되며 복구 불가능합니다.
      </p>

      <div className="card flex flex-col gap-3 p-6">
        <h2 className="text-sm font-semibold text-ink">삭제되는 항목</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted">
          <li>· 계정 정보(이름, 이메일, 등급 이력, 유튜브 채널 연결)</li>
          <li>· 등록한 영상의 제목·링크·썸네일 (다른 회원의 좋아요·댓글 기록은 보존됩니다)</li>
          <li>· 내가 남긴 좋아요, 받은 AI 코멘트, 알림</li>
          <li>· 구글 계정 로그인 연결</li>
        </ul>
        <h2 className="mt-2 text-sm font-semibold text-ink">유지되는 항목</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted">
          <li>· 내가 남긴 댓글은 &ldquo;탈퇴한 회원&rdquo;으로 표시되어 내용은 남습니다</li>
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink">
          계속하려면 본인 이메일( <span className="font-mono">{email}</span> )을 입력하세요
        </label>
        <input
          type="email"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={email}
          className="input-field px-4 text-sm"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={handleWithdraw}
        disabled={pending || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
        className="btn rounded-[10px] bg-danger px-6 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "처리 중..." : "탈퇴하기"}
      </button>
    </div>
  );
}
