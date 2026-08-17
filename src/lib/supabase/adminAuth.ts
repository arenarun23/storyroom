import "server-only";
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
