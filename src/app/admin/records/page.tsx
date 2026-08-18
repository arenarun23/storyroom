import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import RecordsClient from "@/app/admin/records/RecordsClient";
import type { AdminMemberRow, Level, Role } from "@/lib/types";

// SCR-12 회원관리 (시방서상 명칭은 "기록관리")
export default async function AdminRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const [{ data: viewerProfile }, { data: members }, { data: levels }, { level }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.rpc("admin_list_members"),
    supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
    searchParams,
  ]);

  return (
    <AdminShell email={user.email ?? ""}>
      <RecordsClient
        members={(members as AdminMemberRow[] | null) ?? []}
        levels={levels ?? []}
        viewerRole={(viewerProfile?.role as Role | undefined) ?? "admin"}
        initialLevel={level ?? ""}
      />
    </AdminShell>
  );
}
