import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import MembersClient from "@/app/admin/members/MembersClient";

// SCR-13 회원 승인
export default async function AdminMembersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, display_name, auth_provider, created_at")
    .eq("role", "user")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true });

  return (
    <AdminShell email={user.email ?? ""}>
      <div className="flex flex-col gap-6">
        <h1 className="font-title text-xl font-bold text-ink">회원 승인</h1>
        <MembersClient members={members ?? []} />
      </div>
    </AdminShell>
  );
}
