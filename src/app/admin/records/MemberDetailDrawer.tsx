"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminClearManualOverride,
  adminReassignVideo,
  adminReleaseCooldown,
  adminResetVideo,
  adminSetExpiry,
  adminSetLevel,
  adminSetPassword,
  adminSetVideoStatus,
  adminToggleCommentVisibility,
  adminUpdateMemberInfo,
  fetchMemberDetail,
  type MemberDetail,
} from "@/app/admin/records/actions";
import { formatDuration, isPast } from "@/lib/format";
import { SUPER_ADMIN_EMAIL } from "@/lib/roles";
import { REGIONS } from "@/lib/regions";
import MemberSearchSelect from "@/components/MemberSearchSelect";
import type { AdminMemberRow, Level, Role } from "@/lib/types";

const TABS = ["기본 정보", "지표", "영상", "활동", "등급 이력", "AI 코멘트"] as const;
type Tab = (typeof TABS)[number];

interface MemberDetailDrawerProps {
  member: AdminMemberRow;
  levels: Level[];
  viewerRole: Role;
  allMembers: AdminMemberRow[];
  onClose: () => void;
}

export default function MemberDetailDrawer({
  member,
  levels,
  viewerRole,
  allMembers,
  onClose,
}: MemberDetailDrawerProps) {
  const [tab, setTab] = useState<Tab>("기본 정보");
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const loading = detail === null;
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetchMemberDetail(member.id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  function refreshAndClose() {
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-paper shadow-[var(--shadow-s3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-ink">{member.display_name ?? "이름 없음"}</p>
            <p className="text-xs text-muted">{member.email}</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-muted hover:text-ink">
            ×
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-line px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-[10px] px-3 py-1.5 text-xs font-medium ${
                tab === t ? "bg-teal-soft text-teal-deep" : "text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading || !detail ? (
            <p className="text-center text-sm text-muted">불러오는 중...</p>
          ) : (
            <>
              {tab === "기본 정보" && (
                <BasicInfoTab member={member} levels={levels} viewerRole={viewerRole} onDone={refreshAndClose} />
              )}
              {tab === "지표" && <MetricsTab detail={detail} />}
              {tab === "영상" && (
                <VideosTab
                  detail={detail}
                  otherMembers={allMembers.filter(
                    (m) => m.id !== member.id && m.approval_status === "approved" && m.status === "active",
                  )}
                  onChanged={() => router.refresh()}
                />
              )}
              {tab === "활동" && <ActivityTab detail={detail} onChanged={() => router.refresh()} />}
              {tab === "등급 이력" && <HistoryTab detail={detail} levels={levels} />}
              {tab === "AI 코멘트" && (
                <p className="text-center text-sm text-muted">아직 받은 AI 코멘트가 없습니다.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BasicInfoTab({
  member,
  levels,
  viewerRole,
  onDone,
}: {
  member: AdminMemberRow;
  levels: Level[];
  viewerRole: Role;
  onDone: () => void;
}) {
  const [displayName, setDisplayName] = useState(member.display_name ?? "");
  const [realName, setRealName] = useState(member.real_name ?? "");
  const [region, setRegion] = useState(member.region ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [schoolName, setSchoolName] = useState(member.school_name ?? "");
  const [role, setRole] = useState<Role>(member.role);
  const [status, setStatus] = useState(member.status);
  const [levelCode, setLevelCode] = useState(member.current_level);
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState(member.level_expires_at?.slice(0, 10) ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isCoolingDown = !!member.promotion_locked_until && !isPast(member.promotion_locked_until);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "처리에 실패했습니다.");
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">표시 이름</label>
        <div className="flex gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input-field flex-1 px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => adminUpdateMemberInfo(member.id, { display_name: displayName }))}
            className="chip bg-teal px-4 text-xs font-semibold text-white"
          >
            저장
          </button>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <p className="text-xs font-semibold text-ink">온보딩 정보 (오프라인 행사 안내용)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">성명</label>
            <input
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              className="input-field px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">소속 시도</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="input-field px-2 text-sm"
            >
              <option value="">미입력</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">연락처</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field px-3 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">소속 학교</label>
            <input
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="input-field px-3 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              adminUpdateMemberInfo(member.id, {
                real_name: realName || null,
                region: region || null,
                phone: phone || null,
                school_name: schoolName || null,
              }),
            )
          }
          className="chip self-start bg-teal px-4 text-xs font-semibold text-white"
        >
          저장
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">역할</label>
          {member.role === "super_admin" && viewerRole !== "super_admin" ? (
            <span className="chip self-start bg-gold-soft px-3 text-xs font-semibold text-gold">
              최고관리자 (최고관리자만 변경 가능)
            </span>
          ) : (
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="input-field flex-1 px-2 text-sm"
              >
                <option value="user">일반회원</option>
                <option value="admin">관리자</option>
                {viewerRole === "super_admin" && member.email === SUPER_ADMIN_EMAIL && (
                  <option value="super_admin">최고관리자</option>
                )}
              </select>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => adminUpdateMemberInfo(member.id, { role }))}
                className="chip border border-line px-3 text-xs font-semibold text-ink"
              >
                저장
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">상태</label>
          <div className="flex gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="input-field flex-1 px-2 text-sm"
            >
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="withdrawn">withdrawn</option>
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => adminUpdateMemberInfo(member.id, { status }))}
              className="chip border border-line px-3 text-xs font-semibold text-ink"
            >
              저장
            </button>
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <p className="text-xs font-semibold text-ink">등급 수동 조정</p>
        <div className="flex gap-2">
          <select
            value={levelCode}
            onChange={(e) => setLevelCode(e.target.value)}
            className="input-field px-2 text-sm"
          >
            {levels.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="변경 사유 (필수)"
          className="input-field px-3 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => adminSetLevel(member.id, levelCode, reason))}
          className="chip bg-teal px-4 text-xs font-semibold text-white"
        >
          등급 적용
        </button>

        {member.manual_override && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => adminClearManualOverride(member.id))}
            className="chip border border-line px-4 text-xs font-semibold text-ink"
          >
            수동조정 해제 (자동 판정으로 복귀)
          </button>
        )}

        {isCoolingDown && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => adminReleaseCooldown(member.id))}
            className="chip border border-line px-4 text-xs font-semibold text-ink"
          >
            복귀 유예 조기 해제
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">유지 만료일</label>
        <div className="flex gap-2">
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="input-field flex-1 px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => adminSetExpiry(member.id, expiry ? new Date(expiry).toISOString() : null))
            }
            className="chip border border-line px-4 text-xs font-semibold text-ink"
          >
            저장
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">비밀번호 재설정</label>
        <p className="text-xs text-muted">
          기존 비밀번호는 조회할 수 없습니다 — 새 비밀번호로 덮어쓰는 것만 가능합니다.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordSaved(false);
            }}
            placeholder="새 비밀번호 (8자 이상)"
            className="input-field flex-1 px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending || newPassword.length < 8}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await adminSetPassword(member.id, newPassword);
                if (!result.ok) {
                  setError(result.message ?? "처리에 실패했습니다.");
                  return;
                }
                setNewPassword("");
                setPasswordSaved(true);
              });
            }}
            className="chip border border-line px-4 text-xs font-semibold text-ink disabled:opacity-50"
          >
            변경
          </button>
        </div>
        {passwordSaved && <p className="text-xs text-teal-deep">비밀번호가 변경되었습니다.</p>}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function MetricsTab({ detail }: { detail: MemberDetail }) {
  const c = detail.metricsCumulative;
  const r = detail.metricsRecent;
  if (!c || !r) return <p className="text-sm text-muted">지표를 불러올 수 없습니다.</p>;

  // yt_views/likes/comments는 채널 스냅샷 값이라 기간 집계가 없다(§6.3) — recent에 null 표시
  const rows: { label: string; cum: number; recent: number | null }[] = [
    { label: "스토리룸 영상 편수", cum: c.video_count, recent: r.video_count },
    { label: "누적 재생시간(분)", cum: c.total_duration_min, recent: r.total_duration_min },
    { label: "유튜브 영상 편수", cum: c.yt_video_count, recent: r.yt_video_count },
    { label: "유튜브 누적 조회수", cum: c.yt_views, recent: null },
  ];

  const metricValue = (key: string, m: typeof c) => (m as unknown as Record<string, number>)[key] ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-2">지표</th>
            <th className="py-2 text-right">누적</th>
            <th className="py-2 text-right">최근 기간</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-line last:border-b-0">
              <td className="py-2 text-ink">{row.label}</td>
              <td className="py-2 text-right font-mono">{Math.round(row.cum)}</td>
              <td className="py-2 text-right font-mono">{row.recent === null ? "—" : Math.round(row.recent)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail.promotionRules.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-teal-deep">다음 등급 승급 기준 충족 여부</p>
          <ul className="flex flex-col gap-1 text-sm">
            {detail.promotionRules.map((rule) => {
              const value = metricValue(rule.metric_key, c);
              const pass = value >= rule.threshold;
              return (
                <li key={rule.id} className="flex items-center justify-between">
                  <span className="text-ink">
                    {rule.metric_key} {rule.operator} {rule.threshold}
                  </span>
                  <span className={pass ? "text-teal-deep" : "text-danger"}>{pass ? "✓" : "✕"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {detail.retentionRules.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-gold">현재 등급 유지 기준 충족 여부 (최근 기간)</p>
          <ul className="flex flex-col gap-1 text-sm">
            {detail.retentionRules.map((rule) => {
              const value = metricValue(rule.metric_key, r);
              const pass = value >= rule.threshold;
              return (
                <li key={rule.id} className="flex items-center justify-between">
                  <span className="text-ink">
                    {rule.metric_key} {rule.operator} {rule.threshold}
                  </span>
                  <span className={pass ? "text-teal-deep" : "text-danger"}>{pass ? "✓" : "✕"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// 관리자가 영상을 검토해 삭제하거나(소프트 삭제, 되돌릴 수 있음) 삭제됐던/
// 거부됐던 영상을 다시 승인할 수 있게 한다. 재승인 시 원래 계정으로
// 승인하거나, 완전 초기화해서 다른 회원 계정으로 재배정할 수 있다.
function VideosTab({
  detail,
  otherMembers,
  onChanged,
}: {
  detail: MemberDetail;
  otherMembers: AdminMemberRow[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reassignForId, setReassignForId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState("");

  function handleSetStatus(videoId: string, status: "active" | "deleted") {
    setBusyId(videoId);
    adminSetVideoStatus(videoId, status).finally(() => {
      setBusyId(null);
      onChanged();
    });
  }

  function handleReassign(videoId: string) {
    if (!reassignTarget) return;
    setBusyId(videoId);
    adminReassignVideo(videoId, reassignTarget).finally(() => {
      setBusyId(null);
      setReassignForId(null);
      setReassignTarget("");
      onChanged();
    });
  }

  function handleResetOnly(videoId: string) {
    setBusyId(videoId);
    adminResetVideo(videoId).finally(() => {
      setBusyId(null);
      setReassignForId(null);
      setReassignTarget("");
      onChanged();
    });
  }

  if (detail.videos.length === 0) return <p className="text-sm text-muted">등록한 영상이 없습니다.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {detail.videos.map((v) => {
        const busy = busyId === v.id;
        return (
          <li
            key={v.id}
            className={`card flex flex-col gap-2 p-3 text-sm transition-opacity duration-150 ${
              busy ? "opacity-50" : "opacity-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="chip bg-teal-soft px-2 text-[11px] font-semibold text-teal-deep">
                {v.platform === "youtube" ? "YouTube" : "스토리룸"}
              </span>
              <span className="chip border border-line px-2 text-[11px]">{v.status}</span>
              {v.is_flagged && <span className="chip bg-gold-soft px-2 text-[11px] text-gold">이상치</span>}
              <span className="font-mono text-xs text-muted">{formatDuration(v.duration_sec)}</span>
            </div>
            <p className="truncate text-xs text-muted">{v.url}</p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                {v.status === "active" ? (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => handleSetStatus(v.id, "deleted")}
                    className="chip border border-line px-3 text-[11px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {busy ? "처리 중..." : "삭제"}
                  </button>
                ) : (
                  (v.status === "deleted" || v.status === "rejected") && (
                    <>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleSetStatus(v.id, "active")}
                        className="chip border border-line px-3 text-[11px] font-semibold text-teal-deep transition-colors duration-150 hover:bg-teal-soft active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {busy ? "처리 중..." : "원본 계정으로 승인"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() =>
                          reassignForId === v.id
                            ? setReassignForId(null)
                            : (setReassignForId(v.id), setReassignTarget(""))
                        }
                        className={`chip border px-3 text-[11px] font-semibold transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${
                          reassignForId === v.id
                            ? "border-gold bg-gold-soft text-gold"
                            : "border-line text-muted hover:text-ink"
                        }`}
                      >
                        다른 계정으로 승인(초기화)
                      </button>
                    </>
                  )
                )}
              </div>

              {reassignForId === v.id && (
                <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-paper p-3">
                  <MemberSearchSelect members={otherMembers} value={reassignTarget} onChange={setReassignTarget} />
                  <button
                    type="button"
                    disabled={!reassignTarget || busyId !== null}
                    onClick={() => handleReassign(v.id)}
                    className="chip border border-gold bg-gold-soft px-3 text-[11px] font-semibold text-gold transition-colors duration-150 hover:bg-gold hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {busy ? "처리 중..." : "선택 계정으로 승인"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => handleResetOnly(v.id)}
                    className="chip border border-line px-3 text-[11px] font-semibold text-muted transition-colors duration-150 hover:bg-danger/10 hover:text-danger active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {busy ? "처리 중..." : "회원 선택 없이 초기화"}
                  </button>
                  <p className="w-full text-[11px] text-muted">
                    원본 기록은 초기화되어 남고, 선택한 회원 계정으로 새로 등록·승인됩니다. 회원을
                    선택하지 않고 초기화만 하면 어느 계정에도 등록되지 않습니다.
                  </p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityTab({ detail, onChanged }: { detail: MemberDetail; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();

  function toggle(id: string, status: "active" | "hidden") {
    startTransition(async () => {
      await adminToggleCommentVisibility(id, status);
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold text-ink">남긴 댓글</p>
        {detail.commentsGiven.length === 0 ? (
          <p className="text-sm text-muted">없음</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.commentsGiven.map((c) => (
              <li key={c.id} className="card flex items-start justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="text-ink">{c.content}</p>
                  <p className="text-xs text-muted">{new Date(c.created_at).toLocaleDateString("ko-KR")}</p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(c.id, c.status === "active" ? "hidden" : "active")}
                  className="chip shrink-0 border border-line px-3 text-[11px] font-semibold text-ink"
                >
                  {c.status === "active" ? "숨기기" : "복원"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-ink">받은 댓글</p>
        {detail.commentsReceived.length === 0 ? (
          <p className="text-sm text-muted">없음</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.commentsReceived.map((c) => (
              <li key={c.id} className="card flex items-start justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted">{c.profiles?.display_name ?? "탈퇴한 회원"}</p>
                  <p className="text-ink">{c.content}</p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(c.id, c.status === "active" ? "hidden" : "active")}
                  className="chip shrink-0 border border-line px-3 text-[11px] font-semibold text-ink"
                >
                  {c.status === "active" ? "숨기기" : "복원"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HistoryTab({ detail, levels }: { detail: MemberDetail; levels: Level[] }) {
  if (detail.levelHistory.length === 0) return <p className="text-sm text-muted">등급 변동 이력이 없습니다.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {detail.levelHistory.map((h) => (
        <li key={h.id} className="card flex flex-col gap-1 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">
              {levels.find((l) => l.code === h.from_level)?.name ?? h.from_level ?? "—"} → {h.level_name_snapshot}
            </span>
            <span className="chip border border-line px-2 text-[11px]">{h.change_type}</span>
          </div>
          {h.reason && <p className="text-xs text-muted">{h.reason}</p>}
          <p className="font-mono text-[11px] text-muted">{new Date(h.created_at).toLocaleString("ko-KR")}</p>
        </li>
      ))}
    </ul>
  );
}
