import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import LevelBadge from "@/components/LevelBadge";
import { METRIC_LABELS } from "@/lib/format";
import { isAdminRole } from "@/lib/roles";
import type { Level } from "@/lib/types";

interface LevelRule {
  id: string;
  target_level: string;
  rule_type: "promotion" | "retention";
  metric_key: string;
  operator: string;
  threshold: number;
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

  return (
    <AppShell
      displayName={profile?.display_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      email={user.email ?? ""}
      isAdmin={isAdminRole(profile?.role)}
    >
      <div className="flex flex-col gap-8">
        <h1 className="font-title text-xl font-bold text-ink">등급 안내</h1>

        <div className="flex flex-col gap-6">
          {(levels ?? []).map((level) => {
            const promotionRules = (rules ?? []).filter(
              (r) => r.target_level === level.code && r.rule_type === "promotion",
            );
            const retentionRules = (rules ?? []).filter(
              (r) => r.target_level === level.code && r.rule_type === "retention",
            );
            const isCurrent = profile?.current_level === level.code;

            return (
              <section
                key={level.code}
                className={`card flex flex-col gap-5 p-6 sm:flex-row sm:items-start ${
                  isCurrent ? "ring-2 ring-teal" : ""
                }`}
              >
                <LevelBadge level={level} size="96px" />

                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-title text-lg font-bold text-ink">{level.name}</h2>
                    {isCurrent && (
                      <span className="chip bg-teal px-3 text-[11px] font-semibold text-white">현재 등급</span>
                    )}
                  </div>

                  {level.description && <p className="text-sm text-muted">{level.description}</p>}

                  {promotionRules.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-teal-deep">승급 기준 (누적)</p>
                      <ul className="flex flex-col gap-0.5 text-sm text-ink">
                        {promotionRules.map((r) => (
                          <li key={r.id}>
                            {METRIC_LABELS[r.metric_key] ?? r.metric_key} {r.operator} {r.threshold}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {retentionRules.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-teal-deep">유지 기준 (최근 활동)</p>
                      <ul className="flex flex-col gap-0.5 text-sm text-ink">
                        {retentionRules.map((r) => (
                          <li key={r.id}>
                            {METRIC_LABELS[r.metric_key] ?? r.metric_key} {r.operator} {r.threshold}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {level.benefits && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-gold">혜택</p>
                      <p className="text-sm text-ink">{level.benefits}</p>
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
