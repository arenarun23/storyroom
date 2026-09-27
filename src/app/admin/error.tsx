"use client";

import { useEffect } from "react";
import Link from "next/link";

// /admin/* 전 구간 오류 화면. 관리자 대시보드로 돌아갈 수 있는 링크를 제공한다.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <p className="font-title text-lg font-bold text-ink">관리자 페이지를 불러오지 못했습니다</p>
      <p className="max-w-xs text-sm text-muted">잠시 후 다시 시도해 주세요. 문제가 반복되면 개발팀에 알려주세요.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="btn rounded-[10px] bg-teal px-5 text-sm font-semibold text-white"
        >
          다시 시도
        </button>
        <Link href="/admin" className="chip border border-line px-5 text-sm font-semibold text-ink">
          대시보드로
        </Link>
      </div>
    </div>
  );
}
