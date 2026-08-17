# 스토리룸 교사 그룹

선생님이 storyroom.co.kr에서 만든 영상을 등록하면, 등록 편수와 누적 재생시간에 따라
등급(L0~L3)이 자동으로 부여·유지·강등되는 웹 서비스입니다.

## 기술 스택

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth + RLS)
- Vercel 배포

## 시작하기

```bash
npm install
npm run dev
```

`.env.local.example`을 참고해 `.env.local`에 Supabase 프로젝트 값을 채워야 로그인·DB 기능이 동작합니다.

## DB 마이그레이션

Supabase SQL Editor에서 `sql/` 폴더의 파일을 아래 순서대로 실행합니다.

1. `01_schema.sql`
2. `02_promotion_cooldown.sql`
3. `03_video_feed.sql`
4. `04_admin.sql`
5. `05_superadmin.sql`
6. `06_onboarding.sql`

## 주요 경로

- `/` `/login` — 랜딩·구글 로그인
- `/me` — 내 정보(영상 등록, 등급 확인)
- `/videos` `/videos/[id]` — 영상 피드·상세(좋아요·댓글)
- `/levels` — 등급 안내
- `/admin` — 관리자 대시보드 (회원관리·등급관리·기준설정·전역설정·감사로그)
