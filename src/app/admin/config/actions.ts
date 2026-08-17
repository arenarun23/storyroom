"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

// SCR-17 전역 설정
export async function adminUpdateConfig(key: string, value: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { data: before } = await client.from("app_config").select("value").eq("key", key).single();
  const { error } = await client
    .from("app_config")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) return { ok: false, message: "저장에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "update_config",
    target_table: "app_config",
    target_id: key,
    before,
    after: { value },
  });

  revalidatePath("/admin/config");
  return { ok: true };
}
