"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

interface RuleInput {
  target_level: string;
  rule_type: "promotion" | "retention";
  metric_key: string;
  operator: string;
  threshold: number;
}

// FR-406/407: 승급·유지 기준 관리. 좋아요·댓글 선택 및 유지 규칙에 부적합한
// 지표는 DB CHECK 제약(level_rules_metric_check)이 최종적으로 막아준다.
export async function adminCreateRule(input: RuleInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { error } = await client.from("level_rules").insert(input);
  if (error) {
    if (error.code === "23514") {
      return { ok: false, message: "이 지표는 선택한 규칙 유형에 사용할 수 없습니다." };
    }
    return { ok: false, message: "규칙 추가에 실패했습니다." };
  }

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "create_rule",
    target_table: "level_rules",
    after: input,
  });

  revalidatePath("/admin/rules");
  return { ok: true };
}

export async function adminUpdateRule(
  id: string,
  patch: { threshold?: number; operator?: string; is_active?: boolean },
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { error } = await client.from("level_rules").update(patch).eq("id", id);
  if (error) return { ok: false, message: "저장에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "update_rule",
    target_table: "level_rules",
    target_id: id,
    after: patch,
  });

  revalidatePath("/admin/rules");
  return { ok: true };
}

export async function adminDeleteRule(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { error } = await client.from("level_rules").delete().eq("id", id);
  if (error) return { ok: false, message: "삭제에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "delete_rule",
    target_table: "level_rules",
    target_id: id,
  });

  revalidatePath("/admin/rules");
  return { ok: true };
}
