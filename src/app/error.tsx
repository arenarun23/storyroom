"use client";

import { useEffect } from "react";
import Link from "next/link";

// 렌더링 중 발생한 오류를 잡아 빈 화면 대신 안내 문구를 보여준다(Next.js App Router 규약).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <p className="font-title text-lg font-bold text-ink">문제가 발생했습니다</p>
      <p className="max-w-xs text-sm text-muted">
        페이지를 불러오는 중 오류가 생겼습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="btn rounded-[10px] bg-teal px-5 text-sm font-semibold text-white"
        >
          다시 시도
        </button>
        <Link href="/" className="chip border border-line px-5 text-sm font-semibold text-ink">
          홈으로
        </Link>
      </div>
    </div>
  );
}
