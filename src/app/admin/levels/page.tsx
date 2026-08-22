import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import LevelsClient from "@/app/admin/levels/LevelsClient";
import type { LevelRuleLite } from "@/lib/levelSummary";
import type { Level } from "@/lib/types";

export interface AdminLevelRule extends LevelRuleLite {
  id: string;
  target_level: string;
  rule_type: "promotion" | "retention";
}

// SCR-14 등급 관리
export default async function AdminLevelsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const [{ data: levels }, { data: rules }] = await Promise.all([
    supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
    supabase
      .from("level_rules")
      .select("id, target_level, rule_type, metric_key, operator, threshold")
      .eq("is_active", true)
      .returns<AdminLevelRule[]>(),
  ]);

  return (
    <AdminShell email={user.email ?? ""}>
      <LevelsClient levels={levels ?? []} rules={rules ?? []} />
    </AdminShell>
  );
}
