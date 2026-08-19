import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// 클릭재킹·XSS 노출 완화용 보안 헤더 5종(CSP/X-Frame-Options/
// X-Content-Type-Options/Referrer-Policy/Permissions-Policy) + 관리자
// 경로 검색엔진 노출 차단(X-Robots-Tag).
// CSP는 실제 사용 중인 외부 리소스만 허용한다:
//  - cdn.jsdelivr.net: Pretendard 폰트 CSS/폰트 파일
//  - www.youtube-nocookie.com: 유튜브 영상 임베드
//  - img-src/media-src를 https: 전체로 열어둔 것은, 회원이 등록하는
//    영상 링크(스토리룸 mp4)와 구글 프로필 사진 도메인이 고정돼 있지
//    않아 특정 호스트만 허용하면 정상 콘텐츠가 깨지기 때문이다.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // 개발 모드에서는 Next.js Fast Refresh가 eval()을 쓴다(React가 프로덕션에서는
  // 절대 안 쓴다고 명시) — 로컬 개발이 깨지지 않도록 dev에서만 unsafe-eval 허용.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net data:",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  // 개발 모드 HMR 웹소켓(ws://localhost:*)도 dev에서만 허용한다.
  `connect-src 'self' ${supabaseUrl}${isDev ? " ws://localhost:*" : ""}`,
  "frame-src https://www.youtube-nocookie.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
