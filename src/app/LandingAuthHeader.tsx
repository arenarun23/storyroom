"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 로그인 상태로 랜딩 페이지를 볼 때 상단에 "시작하기" 대신 계정명 + 로그아웃을 보여준다.
export default function LandingAuthHeader({ displayName }: { displayName: string | null }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/me"
        className="text-sm font-medium text-ink transition-colors duration-150 hover:text-teal-deep"
      >
        {displayName ?? "선생님"}
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-[10px] border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-teal-soft hover:text-teal-deep active:scale-95"
      >
        로그아웃
      </button>
    </div>
  );
}
