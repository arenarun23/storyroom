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

  const { data: existing } = await client
    .from("level_rules")
    .select("sort_order")
    .eq("target_level", input.target_level)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (existing?.sort_order ?? -1) + 1;

  const { error } = await client.from("level_rules").insert({ ...input, sort_order: nextSortOrder });
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

  await client.rpc("admin_reevaluate_all");

  revalidatePath("/admin/rules");
  revalidatePath("/admin/records");
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

  await client.rpc("admin_reevaluate_all");

  revalidatePath("/admin/rules");
  revalidatePath("/admin/records");
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

  await client.rpc("admin_reevaluate_all");

  revalidatePath("/admin/rules");
  revalidatePath("/admin/records");
  return { ok: true };
}

// 표시 순서만 바꾼다 — 판정 로직(check_rules)은 규칙을 순서 없이 AND로
// 평가하므로 등급 판정 결과에는 영향이 없다.
export async function adminReorderRules(orderedIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const results = await Promise.all(
    orderedIds.map((id, index) => client.from("level_rules").update({ sort_order: index }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed) return { ok: false, message: "순서 저장에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "reorder_rules",
    target_table: "level_rules",
  });

  revalidatePath("/admin/rules");
  return { ok: true };
}
