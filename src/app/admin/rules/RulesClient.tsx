"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateRule, adminDeleteRule, adminUpdateRule } from "@/app/admin/rules/actions";
import { METRIC_LABELS } from "@/lib/format";
import type { Level, LevelRule } from "@/lib/types";

const PROMOTION_METRICS = ["video_count", "total_duration_min", "yt_video_count", "yt_views", "yt_likes", "yt_comments"];
const RETENTION_METRICS = ["video_count", "total_duration_min", "yt_video_count"];
const OPERATORS = [">=", ">", "<=", "<", "="];

interface RulesClientProps {
  levels: Level[];
  rules: LevelRule[];
}

export default function RulesClient({ levels, rules }: RulesClientProps) {
  const router = useRouter();
  const targetableLevels = levels.filter((l) => l.order_no > 0);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-title text-xl font-bold text-ink">기준 설정</h1>

      {targetableLevels.map((level) => (
        <LevelRulesSection
          key={level.code}
          level={level}
          rules={rules.filter((r) => r.target_level === level.code)}
          onChanged={() => router.refresh()}
        />
      ))}
    </div>
  );
}

function LevelRulesSection({
  level,
  rules,
  onChanged,
}: {
  level: Level;
  rules: LevelRule[];
  onChanged: () => void;
}) {
  const [ruleType, setRuleType] = useState<"promotion" | "retention">("promotion");
  const [metric, setMetric] = useState(PROMOTION_METRICS[0]);
  const [operator, setOperator] = useState(">=");
  const [threshold, setThreshold] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const availableMetrics = ruleType === "promotion" ? PROMOTION_METRICS : RETENTION_METRICS;

  function handleAdd() {
    setError(null);
    const value = Number(threshold);
    if (!threshold || Number.isNaN(value)) {
      setError("기준값을 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const result = await adminCreateRule({
        target_level: level.code,
        rule_type: ruleType,
        metric_key: metric,
        operator,
        threshold: value,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setThreshold("");
      onChanged();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await adminDeleteRule(id);
      onChanged();
    });
  }

  function handleToggle(rule: LevelRule) {
    startTransition(async () => {
      await adminUpdateRule(rule.id, { is_active: !rule.is_active });
      onChanged();
    });
  }

  return (
    <section className="card flex flex-col gap-4 p-6">
      <h2 className="font-title text-lg font-bold text-ink">{level.name}</h2>

      <div className="flex flex-col gap-2">
        {rules.length === 0 ? (
          <p className="text-sm text-muted">등록된 기준이 없습니다.</p>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="chip border border-line px-2 text-[11px]">
                  {rule.rule_type === "promotion" ? "승급" : "유지"}
                </span>
                <span className="text-ink">
                  {METRIC_LABELS[rule.metric_key] ?? rule.metric_key} {rule.operator} {rule.threshold}
                </span>
                {!rule.is_active && <span className="text-xs text-muted">(비활성)</span>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleToggle(rule)}
                  className="chip border border-line px-3 text-[11px] font-semibold text-ink"
                >
                  {rule.is_active ? "비활성화" : "활성화"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleDelete(rule.id)}
                  className="chip border border-line px-3 text-[11px] font-semibold text-danger"
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <select
          value={ruleType}
          onChange={(e) => {
            const t = e.target.value as "promotion" | "retention";
            setRuleType(t);
            setMetric(t === "promotion" ? PROMOTION_METRICS[0] : RETENTION_METRICS[0]);
          }}
          className="input-field px-2 text-xs"
        >
          <option value="promotion">승급 기준</option>
          <option value="retention">유지 기준</option>
        </select>

        <select value={metric} onChange={(e) => setMetric(e.target.value)} className="input-field px-2 text-xs">
          {availableMetrics.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>

        <select value={operator} onChange={(e) => setOperator(e.target.value)} className="input-field px-2 text-xs">
          {OPERATORS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="기준값"
          className="input-field w-24 px-2 text-xs"
        />

        <button
          type="button"
          disabled={pending}
          onClick={handleAdd}
          className="chip bg-teal px-4 text-xs font-semibold text-white"
        >
          추가
        </button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
