"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

// FR-901~908: 회원 탈퇴. withdraw_user()는 authenticated에서 직접 호출할 수
// 없도록 막혀있으므로(임의 uuid로 남을 탈퇴시키는 것을 방지), 본인 확인 후
// service role로 대신 호출한다.
export async function withdrawAccount(confirmEmail: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  if (confirmEmail.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return { ok: false, message: "이메일이 일치하지 않습니다." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("withdraw_user", { p_user: user.id });

  if (error) {
    return { ok: false, message: "탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
  }

  return { ok: true };
}
