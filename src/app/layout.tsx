import type { Metadata } from "next";
import { Noto_Serif_KR, IBM_Plex_Mono, Nanum_Gothic } from "next/font/google";
import "./globals.css";

const notoSerifKr = Noto_Serif_KR({
  weight: ["700", "900"],
  subsets: ["latin"],
  variable: "--font-noto-serif-kr",
  preload: false,
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  preload: false,
});

const nanumGothic = Nanum_Gothic({
  weight: ["700", "800"],
  subsets: ["latin"],
  variable: "--font-nanum-gothic",
  preload: false,
});

export const metadata: Metadata = {
  title: "STORYROOM EDU CERTIFICATION",
  description: "오늘 만든 한 편이 내일의 레벨이 됩니다",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSerifKr.variable} ${ibmPlexMono.variable} ${nanumGothic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Pretendard: Google Fonts 미지원 — jsDelivr CDN variable 폰트 사용 */}
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
