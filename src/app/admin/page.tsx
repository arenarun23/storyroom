import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import type { Level } from "@/lib/types";

// SCR-11 관리자 대시보드 (FR-701: 등급별 회원 수 요약)
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const [{ data: levels }, { data: members }, { count: rejectedCount }] = await Promise.all([
    supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
    supabase.from("profiles").select("current_level, approval_status"),
    supabase.from("videos").select("*", { count: "exact", head: true }).eq("status", "rejected"),
  ]);

  const byLevel = new Map<string, number>();
  let pendingCount = 0;
  for (const m of members ?? []) {
    byLevel.set(m.current_level, (byLevel.get(m.current_level) ?? 0) + 1);
    if (m.approval_status === "pending") pendingCount += 1;
  }
  const totalMembers = members?.length ?? 0;

  return (
    <AdminShell email={user.email ?? ""}>
      <div className="flex flex-col gap-8">
        <h1 className="font-title text-xl font-bold text-ink">대시보드</h1>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(levels ?? []).map((level) => (
            <div key={level.code} className="card flex flex-col gap-1 p-5">
              <span className="font-mono text-3xl font-bold text-ink">{byLevel.get(level.code) ?? 0}</span>
              <span className="text-xs text-teal-deep">{level.name}</span>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="card flex flex-col gap-1 p-5">
            <span className="font-mono text-2xl font-bold text-ink">{totalMembers}</span>
            <span className="text-xs text-muted">전체 회원 수</span>
          </div>
          <Link href="/admin/members" className="card flex flex-col gap-1 p-5">
            <span className="font-mono text-2xl font-bold text-gold">{pendingCount}</span>
            <span className="text-xs text-muted">승인 대기 중 → 처리하러 가기</span>
          </Link>
          <Link href="/admin/videos" className="card flex flex-col gap-1 p-5">
            <span className="font-mono text-2xl font-bold text-danger">{rejectedCount ?? 0}</span>
            <span className="text-xs text-muted">거절된 영상 → 검토하러 가기</span>
          </Link>
          <Link href="/admin/records" className="card flex flex-col gap-1 p-5">
            <span className="text-sm font-semibold text-teal-deep">회원관리 바로가기</span>
            <span className="text-xs text-muted">회원별 지표·등급·권한 조정</span>
          </Link>
        </section>
      </div>
    </AdminShell>
  );
}
