import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LevelBadge from "@/components/LevelBadge";
import type { Level } from "@/lib/types";

const FALLBACK_LEVELS: Pick<
  Level,
  "code" | "order_no" | "name" | "badge_color" | "badge_image_url" | "description"
>[] = [
  {
    code: "L0",
    order_no: 0,
    name: "Starter",
    badge_color: "#C3CFCD,#8B9B98",
    badge_image_url: "/badges/starter.png",
    description: "스토리룸 교사 인증에 가입하면 바로 적용되는 레벨입니다. 등급 기준을 충족하면 비기너가 될 수 있습니다.",
  },
  {
    code: "L1",
    order_no: 1,
    name: "Beginner",
    badge_color: "#6BD3C4,#2A9187",
    badge_image_url: "/badges/beginner.png",
    description:
      "축하합니다. 스토리룸 비기너가 되셨군요. 멋진 영상 제작을 위한 첫 발걸음을 떼셨습니다. 등급 기준을 충족하면 크리에이터가 될 수 있습니다.",
  },
  {
    code: "L2",
    order_no: 2,
    name: "Creator",
    badge_color: "#1CC0AE,#0A6B62",
    badge_image_url: "/badges/creator.png",
    description: "영상 제작을 위한 위대한 여정에 함께 하신 것을 환영합니다. 멋진 교육용 영상을 만들어 주세요.",
  },
  {
    code: "L3",
    order_no: 3,
    name: "Master",
    badge_color: "#F0D588,#A97615",
    badge_image_url: "/badges/master.png",
    description: "영상 제작의 끝을 보셨군요. 이제 하산하셔도 되겠습니다.",
  },
];

const STEPS = [
  { title: "영상 링크 등록", body: "storyroom.co.kr에서 만든 영상 링크를 붙여넣으면 재생시간이 자동으로 입력됩니다." },
  { title: "자동 등급 판정", body: "등록 편수와 누적 재생시간에 따라 레벨이 자동으로 오르고 유지됩니다." },
  { title: "꾸준히 이어가기", body: "최근 활동을 유지하면 등급이 계속 유지되고, 놓쳐도 다시 도전할 수 있습니다." },
];

export default async function LandingPage() {
  const supabase = await createClient();

  const [{ data: levels }, { data: stats }] = await Promise.all([
    supabase
      .from("levels")
      .select("code, order_no, name, badge_color, badge_image_url, description")
      .order("order_no"),
    supabase.rpc("public_stats").single(),
  ]);

  const badgeLevels = levels && levels.length > 0 ? levels : FALLBACK_LEVELS;
  const teacherCount = (stats as { teacher_count?: number } | null)?.teacher_count ?? 0;
  const videoCount = (stats as { video_count?: number } | null)?.video_count ?? 0;
  const showStats = teacherCount > 0;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-title text-lg font-bold text-teal-deep">STORYROOM EDU CERTIFICATION</span>
        <Link
          href="/login"
          className="btn flex items-center rounded-[10px] bg-teal px-5 text-sm font-semibold text-white"
        >
          시작하기
        </Link>
      </header>

      <section className="flex flex-col items-center gap-8 px-6 py-16 text-center sm:px-10">
        <h1 className="font-title text-3xl font-black leading-tight text-ink sm:text-5xl">
          오늘 만든 한 편이
          <br />
          내일의 레벨이 됩니다
        </h1>
        <p className="max-w-xl text-base text-muted">
          storyroom.co.kr에서 만든 영상을 등록하면, 등록 편수와 누적 재생시간에 따라
          레벨이 자동으로 부여되고 유지됩니다.
        </p>
        <Link
          href="/login"
          className="btn flex items-center rounded-[10px] bg-teal px-8 text-base font-semibold text-white shadow-[var(--shadow-s2)]"
        >
          구글 계정으로 시작하기
        </Link>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-6">
          {badgeLevels.map((level) => (
            <div key={level.code} className="flex flex-col items-center gap-2">
              <LevelBadge level={level} size="88px" showCaption={false} />
              <span className="font-mono text-xs text-muted">{level.name}</span>
            </div>
          ))}
        </div>
      </section>

      {showStats && (
        <section className="mx-6 flex flex-col gap-4 rounded-[var(--radius-card)] bg-teal-soft px-8 py-8 text-center sm:mx-10 sm:flex-row sm:justify-center sm:gap-16">
          <div>
            <p className="font-mono text-3xl font-bold text-teal-deep">{teacherCount}</p>
            <p className="text-sm text-muted">참여 선생님 수</p>
          </div>
          <div>
            <p className="font-mono text-3xl font-bold text-teal-deep">{videoCount}</p>
            <p className="text-sm text-muted">등록 영상 수</p>
          </div>
        </section>
      )}

      <section className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-16 sm:grid-cols-3 sm:px-10">
        {STEPS.map((step, i) => (
          <div key={step.title} className="card flex flex-col gap-3 p-6">
            <span className="font-mono text-sm font-semibold text-teal">STEP {i + 1}</span>
            <h3 className="font-title text-lg font-bold text-ink">{step.title}</h3>
            <p className="text-sm text-muted">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col items-center gap-6 px-6 py-16 text-center sm:px-10">
        <h2 className="font-title text-2xl font-bold text-ink">지금 바로 첫 영상을 등록해 보세요</h2>
        <Link
          href="/login"
          className="btn flex items-center rounded-[10px] bg-teal px-8 text-base font-semibold text-white"
        >
          구글 계정으로 시작하기
        </Link>
      </section>

      <footer className="mt-auto flex flex-col items-center gap-2 border-t border-line px-6 py-8 text-xs text-muted sm:px-10">
        <p>이용약관 · 개인정보처리방침 (준비 중)</p>
        <p>© STORYROOM EDU CERTIFICATION</p>
      </footer>
    </div>
  );
}
