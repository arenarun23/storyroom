import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import ConfigClient from "@/app/admin/config/ConfigClient";
import type { AppConfigRow } from "@/lib/types";

export default async function AdminConfigPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: config } = await supabase
    .from("app_config")
    .select("key, value, description")
    .order("key")
    .returns<AppConfigRow[]>();

  return (
    <AdminShell email={user.email ?? ""}>
      <ConfigClient config={config ?? []} />
    </AdminShell>
  );
}
