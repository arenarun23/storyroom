import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 로그인 성공 직후 호출해 로그인 기록을 남긴다. 세션이 없으면 조용히 무시한다.
export async function recordLogin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");

  const admin = createAdminClient();
  await admin.from("login_history").insert({
    user_id: user.id,
    ip_address: ip,
    user_agent: userAgent,
  });
}
