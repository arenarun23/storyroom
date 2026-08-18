"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminReevaluateAll, adminUpdateMemberInfo } from "@/app/admin/records/actions";
import MemberDetailDrawer from "@/app/admin/records/MemberDetailDrawer";
import CreateMemberDialog from "@/app/admin/records/CreateMemberDialog";
import { formatMinutes, isPast, isWithinWarningWindow } from "@/lib/format";
import { SUPER_ADMIN_EMAIL } from "@/lib/roles";
import type { AdminMemberRow, Level, Role } from "@/lib/types";

type SortKey =
  | "display_name"
  | "current_level"
  | "level_updated_at"
  | "level_expires_at"
  | "video_count"
  | "total_duration_min"
  | "received_likes"
  | "received_comments"
  | "given_likes"
  | "given_comments"
  | "yt_views"
  | "last_active_at"
  | "role";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "display_name", label: "이름" },
  { key: "current_level", label: "등급" },
  { key: "level_updated_at", label: "등급변경일" },
  { key: "level_expires_at", label: "유지 만료일" },
  { key: "video_count", label: "영상 수" },
  { key: "total_duration_min", label: "누적 시간" },
  { key: "received_likes", label: "받은 좋아요" },
  { key: "received_comments", label: "받은 댓글" },
  { key: "given_likes", label: "남긴 좋아요" },
  { key: "given_comments", label: "남긴 댓글" },
  { key: "yt_views", label: "유튜브 조회수" },
  { key: "last_active_at", label: "최근 활동일" },
  { key: "role", label: "권한" },
];

const WARN_DAYS = 30;

interface RecordsClientProps {
  members: AdminMemberRow[];
  levels: Level[];
  viewerRole: Role;
}

export default function RecordsClient({ members, levels, viewerRole }: RecordsClientProps) {
  const [levelFilter, setLevelFilter] = useState("");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [coolingOnly, setCoolingOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("level_expires_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<AdminMemberRow | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const levelOrder = useMemo(() => new Map(levels.map((l) => [l.code, l.order_no])), [levels]);
  const levelName = useMemo(() => new Map(levels.map((l) => [l.code, l.name])), [levels]);
  const countByLevel = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) map.set(m.current_level, (map.get(m.current_level) ?? 0) + 1);
    return map;
  }, [members]);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (levelFilter && m.current_level !== levelFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (verifiedOnly && !m.yt_verified_at) return false;
      if (manualOnly && !m.manual_override) return false;
      if (flaggedOnly && m.flagged_count === 0) return false;
      if (coolingOnly) {
        if (!m.promotion_locked_until || isPast(m.promotion_locked_until)) return false;
      }
      if (expiringOnly) {
        if (!m.level_expires_at || !isWithinWarningWindow(m.level_expires_at, WARN_DAYS)) return false;
      }
      return true;
    });
  }, [members, levelFilter, statusFilter, verifiedOnly, manualOnly, flaggedOnly, coolingOnly, expiringOnly]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      if (sortKey === "current_level") {
        av = levelOrder.get(a.current_level) ?? 0;
        bv = levelOrder.get(b.current_level) ?? 0;
      } else if (sortKey === "display_name") {
        av = a.display_name ?? "";
        bv = b.display_name ?? "";
      } else if (sortKey === "role") {
        av = a.role;
        bv = b.role;
      } else if (sortKey === "level_updated_at" || sortKey === "level_expires_at" || sortKey === "last_active_at") {
        av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
        bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
      } else {
        av = a[sortKey] as number;
        bv = b[sortKey] as number;
      }

      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir, levelOrder]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // FR-710: 현재 필터·정렬 상태 그대로 CSV로 내보내기
  function exportCsv() {
    const headers = ["이름", "이메일", "등급", "상태", "승인상태", ...COLUMNS.slice(2).map((c) => c.label)];
    const rows = sorted.map((m) => [
      m.display_name ?? "",
      m.email,
      levelName.get(m.current_level) ?? m.current_level,
      m.status,
      m.approval_status,
      m.level_updated_at,
      m.level_expires_at ?? "",
      m.video_count,
      m.total_duration_min,
      m.received_likes,
      m.received_comments,
      m.given_likes,
      m.given_comments,
      m.yt_views,
      m.last_active_at,
      m.role,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleReevaluate() {
    setReevaluating(true);
    setMessage(null);
    const result = await adminReevaluateAll();
    setReevaluating(false);
    setMessage(result.ok ? `${result.count}명 재판정을 완료했습니다.` : result.message);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-title text-xl font-bold text-ink">회원관리</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="chip border border-line px-4 text-xs font-semibold text-ink"
          >
            회원 추가
          </button>
          <button
            type="button"
            onClick={handleReevaluate}
            disabled={reevaluating}
            className="chip border border-line px-4 text-xs font-semibold text-ink disabled:opacity-50"
          >
            {reevaluating ? "재판정 중..." : "전체 재판정 실행"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="chip bg-teal px-4 text-xs font-semibold text-white"
          >
            CSV 내보내기
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-teal-deep">{message}</p>}

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="input-field px-3 text-xs">
          <option value="">전체 등급 ({members.length})</option>
          {levels.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({countByLevel.get(l.code) ?? 0})
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field px-3 text-xs">
          <option value="">전체 상태</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
          <option value="withdrawn">탈퇴</option>
        </select>

        {[
          { label: "만료 임박", checked: expiringOnly, set: setExpiringOnly },
          { label: "유예 중", checked: coolingOnly, set: setCoolingOnly },
          { label: "채널 인증", checked: verifiedOnly, set: setVerifiedOnly },
          { label: "수동 조정", checked: manualOnly, set: setManualOnly },
          { label: "이상치", checked: flaggedOnly, set: setFlaggedOnly },
        ].map((f) => (
          <label key={f.label} className="flex items-center gap-1.5 text-xs text-ink">
            <input type="checkbox" checked={f.checked} onChange={(e) => f.set(e.target.checked)} />
            {f.label}
          </label>
        ))}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead>
            <tr className="border-b border-line text-muted">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="cursor-pointer whitespace-nowrap px-3 py-2 font-medium hover:text-ink"
                >
                  {col.label}
                  {sortKey === col.key && (sortDir === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr
                key={m.id}
                onClick={() => setSelected(m)}
                className="cursor-pointer border-b border-line last:border-b-0 hover:bg-teal-soft/40"
              >
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink">
                  {m.display_name ?? "이름 없음"}
                  {m.manual_override && <span className="ml-1 text-gold">●</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{levelName.get(m.current_level) ?? m.current_level}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">
                  {new Date(m.level_updated_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">
                  {m.level_expires_at ? new Date(m.level_expires_at).toLocaleDateString("ko-KR") : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{m.video_count}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMinutes(m.total_duration_min * 60)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{m.received_likes}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{m.received_comments}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{m.given_likes}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{m.given_comments}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{m.yt_views}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">
                  {new Date(m.last_active_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <RoleSelect member={m} viewerRole={viewerRole} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <p className="p-8 text-center text-sm text-muted">조건에 맞는 회원이 없습니다.</p>}
      </div>

      {selected && (
        <MemberDetailDrawer
          key={selected.id}
          member={selected}
          levels={levels}
          viewerRole={viewerRole}
          onClose={() => setSelected(null)}
        />
      )}

      {showCreateDialog && <CreateMemberDialog onClose={() => setShowCreateDialog(false)} />}
    </div>
  );
}

// 권한(role)을 드롭다운으로 즉시 변경 (FR-707). 최고관리자는 지정된 이메일
// 한 명만 가질 수 있고, 최고관리자만 그 등급을 부여·해제할 수 있다.
// 최고관리자 본인 행은 최고관리자만 수정할 수 있도록 읽기 전용으로 보호한다.
function RoleSelect({ member, viewerRole }: { member: AdminMemberRow; viewerRole: Role }) {
  const [role, setRole] = useState<Role>(member.role);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isProtected = member.role === "super_admin" && viewerRole !== "super_admin";
  const canGrantSuperAdmin = viewerRole === "super_admin" && member.email === SUPER_ADMIN_EMAIL;

  if (isProtected) {
    return <span className="chip bg-gold-soft px-3 text-[11px] font-semibold text-gold">최고관리자</span>;
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Role;
    const prev = role;
    setRole(next);
    startTransition(async () => {
      const result = await adminUpdateMemberInfo(member.id, { role: next });
      if (!result.ok) {
        setRole(prev);
        return;
      }
      router.refresh();
    });
  }

  return (
    <select
      value={role}
      onChange={handleChange}
      disabled={pending}
      className="input-field px-2 py-1 text-xs"
    >
      <option value="user">일반회원</option>
      <option value="admin">관리자</option>
      {canGrantSuperAdmin && <option value="super_admin">최고관리자</option>}
    </select>
  );
}
