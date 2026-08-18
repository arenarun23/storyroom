import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import { formatDateTimeKST } from "@/lib/format";

// SCR-18 감사 로그 (읽기 전용)
export default async function AdminAuditPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: logs } = await supabase
    .from("audit_log")
    .select("id, action, target_table, target_id, before, after, created_at, profiles(display_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <AdminShell email={user.email ?? ""}>
      <div className="flex flex-col gap-6">
        <h1 className="font-title text-xl font-bold text-ink">감사 로그</h1>

        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-3 py-2 font-medium">시각</th>
                <th className="px-3 py-2 font-medium">관리자</th>
                <th className="px-3 py-2 font-medium">액션</th>
                <th className="px-3 py-2 font-medium">대상</th>
                <th className="px-3 py-2 font-medium">변경 전</th>
                <th className="px-3 py-2 font-medium">변경 후</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => (
                <tr key={log.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono">
                    {formatDateTimeKST(log.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {(() => {
                      const admin = (log.profiles as { display_name: string | null; email: string }[] | null)?.[0];
                      return admin?.display_name ?? admin?.email ?? "—";
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink">{log.action}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {log.target_table ?? ""} {log.target_id ?? ""}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 font-mono text-muted">
                    {log.before ? JSON.stringify(log.before) : ""}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 font-mono text-muted">
                    {log.after ? JSON.stringify(log.after) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(logs ?? []).length === 0 && (
            <p className="p-8 text-center text-sm text-muted">감사 로그가 없습니다.</p>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
