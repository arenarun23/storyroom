import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import LevelsClient from "@/app/admin/levels/LevelsClient";
import type { Level } from "@/lib/types";

// SCR-14 등급 관리
export default async function AdminLevelsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: levels } = await supabase.from("levels").select("*").order("order_no").returns<Level[]>();

  return (
    <AdminShell email={user.email ?? ""}>
      <LevelsClient levels={levels ?? []} />
    </AdminShell>
  );
}
