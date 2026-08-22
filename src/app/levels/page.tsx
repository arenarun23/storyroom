import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import LevelBadge from "@/components/LevelBadge";
import {
  hexAlpha,
  koreanLevelName,
  noteLines,
  ruleClauses,
  summarizePromotion,
  summarizeRetention,
  summarizeStepper,
  type LevelRuleLite,
} from "@/lib/levelSummary";
import { isAdminRole } from "@/lib/roles";
import type { Level } from "@/lib/types";

interface LevelRule extends LevelRuleLite {
  id: string;
  target_level: string;
  rule_type: "promotion" | "retention";
}

// SCR-05 등급 안내
export default async function LevelsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: levels }, { data: rules }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, current_level, role").eq("id", user.id).single(),
    supabase.from("levels").select("*").eq("is_active", true).order("order_no").returns<Level[]>(),
    supabase
      .from("level_rules")
      .select("id, target_level, rule_type, metric_key, operator, threshold")
      .eq("is_active", true)
      .returns<LevelRule[]>(),
  ]);

  const allLevels = levels ?? [];
  const allRules = rules ?? [];

  return (
    <AppShell
      displayName={profile?.display_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      email={user.email ?? ""}
      isAdmin={isAdminRole(profile?.role)}
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              className="text-[26px] font-bold text-ink"
              style={{ fontFamily: "var(--font-nanum-gothic), sans-serif", letterSpacing: "normal" }}
            >
              등급 안내
            </h1>
            <p className="mt-1 font-nanum text-base text-muted">영상 활동이 쌓일수록 등급과 혜택도 함께 성장합니다.</p>
          </div>
          <span className="chip shrink-0 bg-teal-soft px-3 text-[11px] font-semibold text-teal-deep">
            STORYROOM LEVEL
          </span>
        </div>

        {allLevels.length > 0 && (
          <div className="card flex flex-wrap items-center gap-x-2 gap-y-4 p-5">
            {allLevels.map((level, i) => {
              const promotionRules = allRules.filter(
                (r) => r.target_level === level.code && r.rule_type === "promotion",
              );
              const [, stepColor] = (level.badge_color ?? "#8B9B98,#677876").split(",");
              return (
                <div key={level.code} className="flex items-center gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-white"
                      style={{ backgroundColor: stepColor }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-bold text-ink">{level.name}</span>
                      <span className="font-mono text-[11px] text-muted">
                        {koreanLevelName(level.code, level.name)} · {summarizeStepper(promotionRules)}
                      </span>
                    </div>
                  </div>
                  {i < allLevels.length - 1 && <span className="mx-1 text-muted">→</span>}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-6">
          {allLevels.map((level, i) => {
            const promotionRules = allRules.filter(
              (r) => r.target_level === level.code && r.rule_type === "promotion",
            );
            const retentionRules = allRules.filter(
              (r) => r.target_level === level.code && r.rule_type === "retention",
            );
            const isCurrent = profile?.current_level === level.code;
            const nextLevel = allLevels[i + 1];
            const nextPromotionRules = nextLevel
              ? allRules.filter((r) => r.target_level === nextLevel.code && r.rule_type === "promotion")
              : [];
            const kName = koreanLevelName(level.code, level.name);
            const [fromColor, accentColor] = (level.badge_color ?? "#8B9B98,#677876").split(",");
            const softBg = hexAlpha(fromColor, "38");
            const softerBg = hexAlpha(fromColor, "22");
            const promotionItems = noteLines(level.promotion_note);
            const retentionItems = noteLines(level.retention_note);

            return (
              <section
                key={level.code}
                className={`card flex flex-col gap-5 p-6 sm:flex-row sm:items-start ${
                  isCurrent ? "ring-2 ring-teal" : ""
                }`}
              >
                <LevelBadge level={level} size="112px" />

                <div className="flex flex-1 flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-title text-2xl font-bold text-ink">{level.name}</h2>
                    <span
                      className="chip border px-3 text-[11px] font-semibold"
                      style={{ borderColor: accentColor, color: accentColor, backgroundColor: softerBg }}
                    >
                      LEVEL {level.order_no} · {kName}
                    </span>
                    {isCurrent && (
                      <span className="chip bg-teal px-3 text-[11px] font-semibold text-white">현재 등급</span>
                    )}
                  </div>

                  {level.description && <p className="text-sm text-muted">{level.description}</p>}

                  {promotionRules.length === 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[12px] p-4" style={{ backgroundColor: softBg }}>
                        <p className="mb-2 text-xs font-semibold" style={{ color: accentColor }}>
                          ✓ {kName} 적용 조건
                        </p>
                        {promotionItems.length > 0 ? (
                          <ul className="flex flex-col gap-1 text-sm text-ink">
                            {promotionItems.map((line, idx) => (
                              <li key={idx}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-ink">스토리룸 교사 인증 가입 완료</p>
                            <p className="mt-1 text-xs text-muted">
                              가입 즉시 자동 적용되며, 별도의 영상 제작 실적은 필요하지 않습니다.
                            </p>
                          </>
                        )}
                      </div>
                      {nextLevel && nextPromotionRules.length > 0 && (
                        <div className="rounded-[12px] border border-line p-4">
                          <p className="mb-2 text-xs font-semibold text-ink">→ 다음 목표</p>
                          <p className="text-sm font-semibold text-ink">
                            {koreanLevelName(nextLevel.code, nextLevel.name)} 승급에 도전하세요
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {summarizePromotion(nextPromotionRules, koreanLevelName(nextLevel.code, nextLevel.name))}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div
                        className="flex flex-col justify-between gap-3 rounded-[12px] p-4"
                        style={{ backgroundColor: softBg }}
                      >
                        <div>
                          <p className="mb-2 text-xs font-semibold" style={{ color: accentColor }}>
                            ⊙ {kName} 달성 조건
                          </p>
                          {promotionItems.length > 0 ? (
                            <ul className="flex flex-col gap-1.5 text-sm text-ink">
                              {promotionItems.map((line, idx) => (
                                <li key={idx}>{line}</li>
                              ))}
                            </ul>
                          ) : (
                            <ol className="flex flex-col gap-1.5 text-sm text-ink">
                              {promotionRules.map((r, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span
                                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                    style={{ backgroundColor: accentColor }}
                                  >
                                    {idx + 1}
                                  </span>
                                  {ruleClauses([r])[0]} 달성하기
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                        <p
                          className="rounded-[8px] bg-card px-3 py-1.5 text-[11px] font-semibold"
                          style={{ color: accentColor }}
                        >
                          ✓ {promotionRules.length}개 조건을 모두 충족해야 합니다.
                        </p>
                      </div>

                      <div className="rounded-[12px] border border-line p-4">
                        <p className="mb-2 text-xs font-semibold text-ink">! 승급 조건</p>
                        <p className="text-sm text-muted">{summarizePromotion(promotionRules, kName)}</p>
                      </div>

                      <div className="flex flex-col gap-3">
                        {(retentionRules.length > 0 || retentionItems.length > 0) && (
                          <div className="rounded-[12px] bg-teal-soft/60 p-4">
                            <p className="mb-2 text-xs font-semibold text-teal-deep">↻ {kName} 유지</p>
                            {retentionItems.length > 0 ? (
                              <ul className="flex flex-col gap-1 text-sm text-ink">
                                {retentionItems.map((line, idx) => (
                                  <li key={idx}>{line}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-ink">{summarizeRetention(retentionRules)}</p>
                            )}
                          </div>
                        )}
                        {level.benefits && (
                          <div className="rounded-[12px] p-4" style={{ backgroundColor: softerBg }}>
                            <p className="mb-2 text-xs font-semibold" style={{ color: accentColor }}>
                              ★ {kName} 혜택
                            </p>
                            <p className="text-base font-bold text-ink">{level.benefits}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
