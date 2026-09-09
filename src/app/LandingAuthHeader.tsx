"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 로그인 상태로 랜딩 페이지를 볼 때 상단에 "시작하기" 대신 계정 아이콘 +
// 계정명 + 로그아웃을 보여준다(내 정보 페이지 상단과 동일한 아이콘 스타일).
// 구글 프로필 사진이 없는 계정은 이름 첫 글자 아이콘으로 대신한다.
export default function LandingAuthHeader({
  displayName,
  avatarUrl,
}: {
  displayName: string | null;
  avatarUrl: string | null;
}) {
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
        className="flex items-center gap-2 text-sm font-medium text-ink transition-colors duration-150 hover:text-teal-deep"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-soft text-xs font-bold text-teal-deep">
            {displayName?.[0] ?? "T"}
          </div>
        )}
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
