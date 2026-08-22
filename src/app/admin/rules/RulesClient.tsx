"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateRule, adminDeleteRule, adminReorderRules, adminUpdateRule } from "@/app/admin/rules/actions";
import { adminUpdateConfig } from "@/app/admin/config/actions";
import { METRIC_LABELS } from "@/lib/format";
import type { AppConfigRow, Level, LevelRule } from "@/lib/types";

const PROMOTION_METRICS = [
  "video_count",
  "total_duration_min",
  "yt_video_count",
  "yt_views",
  "yt_likes",
  "yt_comments",
  "blog_post_count",
];
const RETENTION_METRICS = ["video_count", "total_duration_min", "yt_video_count"];
const OPERATORS = [">=", ">", "<=", "<", "="];

interface RulesClientProps {
  levels: Level[];
  rules: LevelRule[];
  config: AppConfigRow[];
}

export default function RulesClient({ levels, rules, config }: RulesClientProps) {
  const router = useRouter();
  const targetableLevels = levels.filter((l) => l.order_no > 0);
  const retentionMode = config.find((c) => c.key === "retention_period_mode")?.value ?? "yearly";
  const retentionMonths = config.find((c) => c.key === "retention_months")?.value ?? "6";
  const retentionManualDate = config.find((c) => c.key === "retention_manual_date")?.value ?? "";

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-title text-xl font-bold text-ink">기준 설정</h1>

      <RetentionExpirySection
        mode={retentionMode}
        months={retentionMonths}
        manualDate={retentionManualDate}
        onChanged={() => router.refresh()}
      />

      {targetableLevels.map((level) => {
        const levelRules = rules.filter((r) => r.target_level === level.code);
        // 순서/활성상태/값이 바뀔 때마다 새 key로 리마운트시켜, ordered 로컬
        // 상태를 최신 서버 데이터로 자연스럽게 다시 초기화한다(useEffect 동기화 불필요).
        const fingerprint = levelRules
          .map((r) => `${r.id}:${r.sort_order}:${r.is_active}:${r.threshold}:${r.operator}`)
          .join("|");
        return (
          <LevelRulesSection
            key={`${level.code}-${fingerprint}`}
            level={level}
            rules={levelRules}
            onChanged={() => router.refresh()}
          />
        );
      })}
    </div>
  );
}

function RetentionExpirySection({
  mode,
  months,
  manualDate,
  onChanged,
}: {
  mode: string;
  months: string;
  manualDate: string;
  onChanged: () => void;
}) {
  const [selectedMode, setSelectedMode] = useState(mode);
  const [selectedMonths, setSelectedMonths] = useState(months);
  const [selectedDate, setSelectedDate] = useState(manualDate);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  function handleSave() {
    setToast(null);
    startTransition(async () => {
      const modeResult = await adminUpdateConfig("retention_period_mode", selectedMode);
      if (!modeResult.ok) {
        setToast({ ok: false, message: modeResult.message ?? "저장에 실패했습니다." });
        return;
      }
      if (selectedMode === "manual") {
        const monthsResult = await adminUpdateConfig("retention_months", selectedMonths);
        if (!monthsResult.ok) {
          setToast({ ok: false, message: monthsResult.message ?? "저장에 실패했습니다." });
          return;
        }
      }
      if (selectedMode === "manual_date") {
        if (!selectedDate) {
          setToast({ ok: false, message: "날짜를 선택해 주세요." });
          return;
        }
        const dateResult = await adminUpdateConfig("retention_manual_date", selectedDate);
        if (!dateResult.ok) {
          setToast({ ok: false, message: dateResult.message ?? "저장에 실패했습니다." });
          return;
        }
      }
      setToast({ ok: true, message: "저장되었습니다." });
      window.setTimeout(() => setToast((t) => (t?.ok ? null : t)), 2000);
      onChanged();
    });
  }

  return (
    <section className="card flex flex-col gap-3 p-6">
      <h2 className="font-title text-lg font-bold text-ink">등급 유지 만료일</h2>
      <p className="text-xs text-muted">
        승급/유지 판정 시 새로 부여되는 만료일 계산 방식입니다. 기존 회원의 만료일에는 영향을 주지 않습니다.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">계산 방식</label>
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
            className="input-field px-2 text-xs"
          >
            <option value="yearly">매년(해당연도 12월 31일)</option>
            <option value="manual">수동(기간 선택)</option>
            <option value="manual_date">수동(날짜 선택)</option>
          </select>
        </div>

        {selectedMode === "manual" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">유지 기간 (개월)</label>
            <input
              type="number"
              min={1}
              value={selectedMonths}
              onChange={(e) => setSelectedMonths(e.target.value)}
              className="input-field w-24 px-2 text-xs"
            />
          </div>
        )}

        {selectedMode === "manual_date" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">만료일</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field px-2 text-xs"
            />
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            disabled={pending}
            onClick={handleSave}
            style={{ height: "48px" }}
            className="chip bg-teal px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-60"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
          {toast && (
            <div
              className={`absolute left-0 top-full z-10 mt-2 whitespace-nowrap rounded-[8px] border px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-s2)] ${
                toast.ok
                  ? "border-teal/40 bg-teal-soft text-teal-deep"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              {toast.message}
            </div>
          )}
        </div>
      </div>
    </section>
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
  const [addPending, startAddTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 순서 변경을 클릭 즉시 화면에 반영(낙관적 업데이트)하기 위한 로컬 상태.
  // 부모가 rules 데이터가 바뀔 때마다 이 컴포넌트를 새 key로 리마운트시켜주므로
  // (RulesClient 참고) 여기서는 초기값만 잡으면 되고 별도 동기화 effect가 필요 없다.
  // 비활성 규칙은 활성 규칙들 다음, 레벨 내 최하위로 자동 정렬된다.
  const [ordered, setOrdered] = useState(() =>
    [...rules].sort((a, b) =>
      a.is_active === b.is_active ? a.sort_order - b.sort_order : a.is_active ? -1 : 1,
    ),
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const availableMetrics = ruleType === "promotion" ? PROMOTION_METRICS : RETENTION_METRICS;

  function handleAdd() {
    setError(null);
    const value = Number(threshold);
    if (!threshold || Number.isNaN(value)) {
      setError("기준값을 입력해 주세요.");
      return;
    }
    startAddTransition(async () => {
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

  function runRowAction(ruleId: string, action: () => Promise<unknown>) {
    setBusyId(ruleId);
    action().finally(() => {
      setBusyId(null);
      onChanged();
    });
  }

  function handleDelete(id: string) {
    runRowAction(id, () => adminDeleteRule(id));
  }

  function handleToggle(rule: LevelRule) {
    runRowAction(rule.id, () => adminUpdateRule(rule.id, { is_active: !rule.is_active }));
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;

    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    setOrdered(next);
    runRowAction(next[target].id, () => adminReorderRules(next.map((r) => r.id)));
  }

  return (
    <section className="card flex flex-col gap-4 p-6">
      <h2 className="font-title text-lg font-bold text-ink">{level.name}</h2>

      <div className="flex flex-col gap-2">
        {ordered.length === 0 ? (
          <p className="text-sm text-muted">등록된 기준이 없습니다.</p>
        ) : (
          ordered.map((rule, index) => {
            const busy = busyId === rule.id;
            return (
              <div
                key={rule.id}
                className={`flex items-center justify-between gap-2 border-b border-line py-2 text-sm transition-opacity duration-150 ${
                  busy ? "opacity-50" : "opacity-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={busyId !== null || index === 0}
                      onClick={() => handleMove(index, -1)}
                      aria-label="위로 이동"
                      className="flex h-4 w-5 items-center justify-center text-xs leading-none text-muted transition-colors duration-150 hover:text-teal-deep disabled:pointer-events-none disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null || index === ordered.length - 1}
                      onClick={() => handleMove(index, 1)}
                      aria-label="아래로 이동"
                      className="flex h-4 w-5 items-center justify-center text-xs leading-none text-muted transition-colors duration-150 hover:text-teal-deep disabled:pointer-events-none disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
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
                    disabled={busyId !== null}
                    onClick={() => handleToggle(rule)}
                    className="chip border border-line px-3 text-[11px] font-semibold text-ink transition-colors duration-150 hover:bg-teal-soft hover:text-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {busy ? "처리 중..." : rule.is_active ? "비활성화" : "활성화"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => handleDelete(rule.id)}
                    className="chip border border-line px-3 text-[11px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {busy ? "처리 중..." : "삭제"}
                  </button>
                </div>
              </div>
            );
          })
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
          disabled={addPending}
          onClick={handleAdd}
          className="chip bg-teal px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-teal-deep active:scale-95 disabled:pointer-events-none disabled:opacity-60"
        >
          {addPending ? "추가 중..." : "추가"}
        </button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
