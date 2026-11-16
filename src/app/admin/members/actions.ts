"use server";

import { revalidatePath } from "next/cache";
import { SUPER_ADMIN_TARGET_MESSAGE, canManageMembers, requireAdmin } from "@/lib/supabase/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

// FR-108: 대기자를 개별 또는 일괄 승인·거부
export async function setApproval(
  memberIds: string[],
  status: "approved" | "rejected",
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  if (!(await canManageMembers(admin, client, memberIds))) {
    return { ok: false, message: SUPER_ADMIN_TARGET_MESSAGE };
  }

  const { error } = await client
    .from("profiles")
    .update({ approval_status: status, approved_at: new Date().toISOString(), approved_by: admin.id })
    .in("id", memberIds);

  if (error) return { ok: false, message: "처리 중 오류가 발생했습니다." };

  await client.from("audit_log").insert(
    memberIds.map((id) => ({
      admin_id: admin.id,
      action: status === "approved" ? "approve_member" : "reject_member",
      target_table: "profiles",
      target_id: id,
    })),
  );

  revalidatePath("/admin/members");
  return { ok: true };
}
