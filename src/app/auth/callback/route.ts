import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordLogin } from "@/lib/loginHistory";

// 로그인 후 이동할 경로는 이 사이트 안의 경로("/..." 형태)만 허용한다.
// `${origin}${next}`로 이어 붙이므로 "@evil.com"·"//evil.com"·"/\\evil.com" 같은
// 값이 들어오면 다른 사이트로 넘어갈 수 있다(open redirect).
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/me";
  }
  return next;
}

// Supabase OAuth 콜백: code를 세션으로 교환한다
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await recordLogin();
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
