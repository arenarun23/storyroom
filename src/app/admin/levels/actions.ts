"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

// §4.7: 표시 이름·설명·혜택·색상 편집 (뱃지 이미지 업로드는 Vercel Blob
// 연동 전까지 보류 — badge_color 그라디언트만 지원)
export async function adminUpdateLevel(
  code: string,
  patch: {
    name?: string;
    description?: string | null;
    benefits?: string | null;
    badge_color?: string | null;
    has_retention?: boolean;
    is_active?: boolean;
  },
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { data: before } = await client.from("levels").select("*").eq("code", code).single();
  const { error } = await client.from("levels").update(patch).eq("code", code);
  if (error) return { ok: false, message: "저장에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "update_level",
    target_table: "levels",
    target_id: code,
    before,
    after: patch,
  });

  revalidatePath("/admin/levels");
  return { ok: true };
}

// 레벨 추가 (L4 이상 생성 가능)
export async function adminCreateLevel(name: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { data: maxRow } = await client
    .from("levels")
    .select("order_no")
    .order("order_no", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxRow?.order_no ?? 0) + 1;
  const code = `L${nextOrder}`;

  const { error } = await client.from("levels").insert({
    code,
    order_no: nextOrder,
    name,
    badge_color: "#C3CFCD,#8B9B98",
    has_retention: true,
  });
  if (error) return { ok: false, message: "레벨 추가에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "create_level",
    target_table: "levels",
    target_id: code,
    after: { code, order_no: nextOrder, name },
  });

  revalidatePath("/admin/levels");
  return { ok: true };
}
