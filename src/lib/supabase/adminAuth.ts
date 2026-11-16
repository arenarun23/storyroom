import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/roles";
import type { Role } from "@/lib/types";

// 모든 관리자 서버 액션의 진입점에서 호출한다. 로그인 + role가 admin/super_admin
// 인지 확인하고, 실패하면 에러를 던진다(NFR-203: 등급/권한 관련 변경은
// SECURITY DEFINER 함수 또는 service role로만 수행 — 그 앞단의 인가 검사).
export async function requireAdmin(): Promise<{ id: string; email: string; role: Role }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdminRole(profile?.role)) throw new Error("관리자 권한이 없습니다.");

  return { id: user.id, email: user.email ?? "", role: profile!.role as Role };
}

export const SUPER_ADMIN_TARGET_MESSAGE = "최고관리자 계정은 최고관리자만 변경할 수 있습니다.";

// 최고관리자 행은 최고관리자만 변경할 수 있다. memberId를 받아 회원 정보를
// 바꾸는 모든 관리자 서버 액션에서 호출한다. 대상 중 최고관리자가 섞여 있는데
// 호출자가 최고관리자가 아니면 false. 조회에 실패하면 안전하게 false(거부)를 돌려준다.
export async function canManageMembers(
  admin: { role: Role },
  client: SupabaseClient,
  memberIds: string[],
): Promise<boolean> {
  if (admin.role === "super_admin") return true;
  if (memberIds.length === 0) return true;

  const { data, error } = await client
    .from("profiles")
    .select("id")
    .in("id", memberIds)
    .eq("role", "super_admin")
    .limit(1);

  if (error || !data) return false;
  return data.length === 0;
}
