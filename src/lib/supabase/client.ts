import { createBrowserClient } from "@supabase/ssr";

// Supabase 프로젝트가 아직 없어 `supabase gen types`로 생성한 타입이 없다.
// 프로젝트 연결 후 `npx supabase gen types typescript` 로 교체 권장.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
