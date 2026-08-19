"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AdminShellProps {
  email: string;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/records", label: "회원관리" },
  { href: "/admin/members", label: "회원승인" },
  { href: "/admin/videos", label: "영상검토" },
  { href: "/admin/levels", label: "등급관리" },
  { href: "/admin/rules", label: "기준설정" },
  { href: "/admin/config", label: "전역설정" },
  { href: "/admin/audit", label: "감사로그" },
];

export default function AdminShell({ email, children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-1 bg-paper">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-card p-4 md:flex">
        <Link
          href="/"
          className="font-title mb-4 block rounded-[10px] px-2 py-1 text-sm font-bold text-teal-deep transition-colors duration-150 hover:bg-teal-soft/50"
        >
          STORYROOM EDU CERTIFICATION 관리자
        </Link>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-[10px] px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              pathname === item.href ? "bg-teal-soft text-teal-deep" : "text-ink hover:bg-teal-soft/50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3 md:px-8">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  pathname === item.href ? "bg-teal-soft text-teal-deep" : "text-ink hover:bg-teal-soft/50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/me"
              title="일반 페이지로 이동"
              aria-label="일반 페이지로 이동"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-muted transition-colors duration-150 hover:bg-teal-soft hover:text-teal-deep"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
              </svg>
            </Link>
            <span className="hidden text-xs text-muted md:inline">{email}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-[10px] border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-teal-soft hover:text-teal-deep active:scale-95"
          >
            로그아웃
          </button>
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
