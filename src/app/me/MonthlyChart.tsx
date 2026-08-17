"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Video } from "@/lib/types";

interface MonthlyChartProps {
  videos: Pick<Video, "created_at" | "duration_sec">[];
}

// §4.3 항목13: 월별 등록 수 · 누적 시간 추이 (영상 ≥1편일 때만 표시)
export default function MonthlyChart({ videos }: MonthlyChartProps) {
  const byMonth = new Map<string, { count: number; minutes: number }>();

  for (const video of videos) {
    const month = video.created_at.slice(0, 7); // YYYY-MM
    const entry = byMonth.get(month) ?? { count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += video.duration_sec / 60;
    byMonth.set(month, entry);
  }

  const data = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month: month.slice(2).replace("-", "."),
      등록수: v.count,
      누적시간: Math.round(v.minutes),
    }));

  return (
    <div className="card p-6">
      <h2 className="font-title mb-4 text-lg font-bold text-ink">월별 활동</h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted)" }} />
            <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="등록수" fill="var(--teal)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
