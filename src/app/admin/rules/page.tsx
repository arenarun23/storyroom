import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import RulesClient from "@/app/admin/rules/RulesClient";
import type { AppConfigRow, Level, LevelRule } from "@/lib/types";

// SCR-15 기준 설정
export default async function AdminRulesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const [{ data: levels }, { data: rules }, { data: config }] = await Promise.all([
    supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
    supabase.from("level_rules").select("*").order("sort_order").returns<LevelRule[]>(),
    supabase
      .from("app_config")
      .select("key, value, description")
      .in("key", ["retention_period_mode", "retention_months", "retention_manual_date"])
      .returns<AppConfigRow[]>(),
  ]);

  return (
    <AdminShell email={user.email ?? ""}>
      <RulesClient levels={levels ?? []} rules={rules ?? []} config={config ?? []} />
    </AdminShell>
  );
}
