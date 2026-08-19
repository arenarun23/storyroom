import type { MetadataRoute } from "next";

// 관리자 페이지는 검색엔진에 노출될 필요가 없다(FR-103/104 접근 자체는
// 로그인·역할 검사로 이미 막혀 있지만, 존재 자체가 크롤러에 잡히지 않도록 한다).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/me", "/onboarding"],
    },
  };
}
