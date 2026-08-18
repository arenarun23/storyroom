import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminRole } from "@/lib/roles";

// Next 16: middleware.ts는 proxy.ts로 이름이 바뀌었다 (export 함수명도 proxy).
// 역할: ① Supabase 세션 쿠키 갱신 ② FR-109 라우트 리다이렉트 ③ 관리자 라우트 가드
// ④ 최초 로그인 온보딩(필수 정보 입력) 게이트
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser()는 필요 시 토큰을 갱신하며 서버에서 세션을 검증한다 (getSession()보다 안전).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthed = Boolean(user);

  // 로그인 세션은 있는데 profiles 행이 없는 경우를 여기서 즉시 복구한다.
  // (스키마 재구성 등으로 profiles만 초기화되고 auth 세션은 남아있는 경우,
  // 복구하지 않으면 /me ↔ /login 리다이렉트 무한루프에 빠진다.)
  let isAdmin = false;
  let needsOnboarding = false;

  if (isAuthed) {
    await supabase.rpc("ensure_profile");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, real_name, region, phone")
      .eq("id", user!.id)
      .single();

    isAdmin = isAdminRole(profile?.role);
    // 역할과 무관하게(관리자·최고관리자 포함) 필수 정보가 비어있으면 온보딩이 필요하다.
    needsOnboarding = !profile?.real_name || !profile?.region || !profile?.phone;
  }

  // FR-109: 로그인 상태로 /login 접근 시 이동 (온보딩 미완료면 그쪽으로).
  // 랜딩 페이지(/)는 로그인 여부와 무관하게 그대로 보여준다(상단 좌측 로고를
  // 눌러 항상 랜딩 페이지로 돌아올 수 있어야 하므로 자동 리다이렉트하지 않는다).
  if (isAuthed && pathname === "/login") {
    return NextResponse.redirect(new URL(needsOnboarding ? "/onboarding" : "/me", request.url));
  }

  // 온보딩(성명·소속시도·연락처) 게이트 — 로그인한 모든 사용자 대상, 최초 로그인
  // 여부와 무관하게 필수 정보가 빌 때마다 계속 적용된다. 로그인/온보딩 자체
  // 경로만 예외로 둔다.
  const isOnboardingPath = pathname === "/onboarding";
  const ONBOARDING_EXEMPT = new Set(["/", "/login", "/admin/login", "/auth/callback", "/onboarding"]);

  if (!isAuthed && isOnboardingPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isAuthed && needsOnboarding && !ONBOARDING_EXEMPT.has(pathname)) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if (isAuthed && isOnboardingPath && !needsOnboarding) {
    return NextResponse.redirect(new URL("/me", request.url));
  }

  // /me는 로그인 사용자 전용
  if (!isAuthed && pathname.startsWith("/me")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /admin/*는 관리자·최고관리자 전용 (FR-103, FR-104). /admin/login만 예외.
  const isAdminArea = pathname.startsWith("/admin") && pathname !== "/admin/login";

  if (isAdminArea && !isAdmin) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (pathname === "/admin/login" && isAdmin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
