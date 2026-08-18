"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";

interface AppShellProps {
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin?: boolean;
  children: React.ReactNode;
}

const BASE_NAV_ITEMS = [
  { href: "/me", label: "내 정보" },
  { href: "/videos", label: "영상 피드" },
  { href: "/levels", label: "등급 안내" },
];

const ADMIN_NAV_ITEM = { href: "/admin", label: "관리자 페이지" };

// §4.8 반응형 네비게이션: 모바일 하단 고정 탭바 / PC 상단 네비.
export default function AppShell({ displayName, avatarUrl, isAdmin = false, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const navItems = isAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-1 flex-col pb-16 md:pb-0">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/95 px-6 py-4 backdrop-blur sm:px-10">
        <Link href="/" className="font-title text-lg font-bold text-teal-deep">
          STORYROOM EDU CERTIFICATION
        </Link>

        <nav className="hidden shrink-0 items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 text-sm font-medium whitespace-nowrap ${
                pathname === item.href ? "text-teal-deep" : "text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <NotificationBell />
          <Link href="/me" title="내 정보" aria-label="내 정보">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-soft text-xs font-bold text-teal-deep">
                {displayName?.[0] ?? "T"}
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 py-6 sm:px-8">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-line bg-card py-2 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-11 min-w-11 flex-col items-center justify-center px-3 text-xs font-medium ${
              pathname === item.href ? "text-teal-deep" : "text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
