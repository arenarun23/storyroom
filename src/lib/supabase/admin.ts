import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service role 키로 RLS를 우회하는 클라이언트. 서버 전용 코드(배치, Cron, 관리자
// 기능)에서만 import 한다 — "server-only" 패키지가 클라이언트 번들 유입을 차단한다.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
