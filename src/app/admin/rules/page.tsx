import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import RulesClient from "@/app/admin/rules/RulesClient";
import type { Level, LevelRule } from "@/lib/types";

// SCR-15 기준 설정
export default async function AdminRulesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const [{ data: levels }, { data: rules }] = await Promise.all([
    supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
    supabase.from("level_rules").select("*").order("sort_order").returns<LevelRule[]>(),
  ]);

  return (
    <AdminShell email={user.email ?? ""}>
      <RulesClient levels={levels ?? []} rules={rules ?? []} />
    </AdminShell>
  );
}
