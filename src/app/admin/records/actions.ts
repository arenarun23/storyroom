"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/adminAuth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPER_ADMIN_EMAIL } from "@/lib/roles";
import type { ActionResult, Comment, Level, LevelRule, Role, Video } from "@/lib/types";

interface UserMetricsLike {
  video_count: number;
  total_duration_min: number;
  yt_video_count: number;
  yt_views: number;
  yt_likes: number;
  yt_comments: number;
  received_likes: number;
  received_comments: number;
  given_likes: number;
  given_comments: number;
}

interface LevelHistoryRow {
  id: string;
  from_level: string | null;
  to_level: string;
  level_name_snapshot: string;
  change_type: string;
  reason: string | null;
  created_at: string;
}

export interface MemberDetail {
  metricsCumulative: UserMetricsLike | null;
  metricsRecent: UserMetricsLike | null;
  promotionRules: LevelRule[];
  retentionRules: LevelRule[];
  videos: Video[];
  commentsGiven: (Comment & { videos: { id: string; title: string | null } | null })[];
  commentsReceived: (Comment & { profiles: { display_name: string | null } | null })[];
  levelHistory: LevelHistoryRow[];
}

// §4.6 상세 패널: 지표/영상/활동/등급이력 탭에 필요한 데이터를 한 번에 모은다
export async function fetchMemberDetail(memberId: string): Promise<MemberDetail> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: currentLevelCode } = await supabase
    .from("profiles")
    .select("current_level")
    .eq("id", memberId)
    .single();

  const { data: levels } = await supabase.from("levels").select("*").order("order_no").returns<Level[]>();
  const cur = levels?.find((l) => l.code === currentLevelCode?.current_level);
  const next = levels?.find((l) => l.order_no === (cur?.order_no ?? 0) + 1 && l.is_active);

  const { data: cfgRow } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "retention_months")
    .single();
  const retentionMonths = Number(cfgRow?.value ?? 6);
  const since = new Date();
  since.setMonth(since.getMonth() - retentionMonths);

  const [
    { data: metricsCumulative },
    { data: metricsRecent },
    { data: promotionRules },
    { data: retentionRules },
    { data: videos },
    { data: commentsGiven },
    ownedVideos,
    { data: levelHistory },
  ] = await Promise.all([
    supabase.rpc("admin_member_metrics", { p_user: memberId, p_since: null }).single<UserMetricsLike>(),
    supabase
      .rpc("admin_member_metrics", { p_user: memberId, p_since: since.toISOString() })
      .single<UserMetricsLike>(),
    next
      ? supabase.from("level_rules").select("*").eq("target_level", next.code).eq("rule_type", "promotion")
      : Promise.resolve({ data: [] }),
    cur
      ? supabase.from("level_rules").select("*").eq("target_level", cur.code).eq("rule_type", "retention")
      : Promise.resolve({ data: [] }),
    supabase.from("videos").select("*").eq("owner_id", memberId).order("created_at", { ascending: false }),
    supabase
      .from("comments")
      .select("id, video_id, actor_id, content, status, created_at, videos(id, title)")
      .eq("actor_id", memberId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("videos").select("id").eq("owner_id", memberId),
    supabase
      .from("level_history")
      .select("id, from_level, to_level, level_name_snapshot, change_type, reason, created_at")
      .eq("user_id", memberId)
      .order("created_at", { ascending: false })
      .returns<LevelHistoryRow[]>(),
  ]);

  const ownedVideoIds = (ownedVideos.data ?? []).map((v) => v.id);
  const { data: commentsReceived } = ownedVideoIds.length
    ? await supabase
        .from("comments")
        .select("id, video_id, actor_id, content, status, created_at, profiles(display_name)")
        .in("video_id", ownedVideoIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  return {
    metricsCumulative: metricsCumulative ?? null,
    metricsRecent: metricsRecent ?? null,
    promotionRules: (promotionRules as LevelRule[] | null) ?? [],
    retentionRules: (retentionRules as LevelRule[] | null) ?? [],
    videos: (videos as Video[] | null) ?? [],
    commentsGiven: (commentsGiven as MemberDetail["commentsGiven"] | null) ?? [],
    commentsReceived: (commentsReceived as MemberDetail["commentsReceived"] | null) ?? [],
    levelHistory: levelHistory ?? [],
  };
}

// FR-416/417: 등급 수동 조정(사유 필수) — 이후 자동 승급·강등에서 제외됨
export async function adminSetLevel(memberId: string, toLevel: string, reason: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!reason.trim()) return { ok: false, message: "사유를 입력해 주세요." };

  const client = createAdminClient();
  const { data: before } = await client
    .from("profiles")
    .select("current_level, manual_override")
    .eq("id", memberId)
    .single();

  const { error } = await client.rpc("apply_level", {
    p_user: memberId,
    p_to_level: toLevel,
    p_reason: reason,
    p_change_type: "manual",
    p_actor: admin.id,
  });
  if (error) return { ok: false, message: "등급 변경에 실패했습니다." };

  await client.from("profiles").update({ manual_override: true }).eq("id", memberId);
  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "set_level",
    target_table: "profiles",
    target_id: memberId,
    before,
    after: { current_level: toLevel, manual_override: true, reason },
  });

  revalidatePath("/admin/records");
  return { ok: true };
}

export async function adminClearManualOverride(memberId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { error } = await client.from("profiles").update({ manual_override: false }).eq("id", memberId);
  if (error) return { ok: false, message: "처리에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "clear_manual_override",
    target_table: "profiles",
    target_id: memberId,
  });

  revalidatePath("/admin/records");
  return { ok: true };
}

// FR-712: 관리자가 복귀 유예를 조기 해제
export async function adminReleaseCooldown(memberId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { error } = await client.rpc("release_cooldown_early", { p_user: memberId, p_admin: admin.id });
  if (error) return { ok: false, message: "처리에 실패했습니다." };

  revalidatePath("/admin/records");
  return { ok: true };
}

export async function adminSetExpiry(memberId: string, expiresAt: string | null): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { data: before } = await client
    .from("profiles")
    .select("level_expires_at")
    .eq("id", memberId)
    .single();

  const { error } = await client.from("profiles").update({ level_expires_at: expiresAt }).eq("id", memberId);
  if (error) return { ok: false, message: "처리에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "set_expiry",
    target_table: "profiles",
    target_id: memberId,
    before,
    after: { level_expires_at: expiresAt },
  });

  revalidatePath("/admin/records");
  return { ok: true };
}

// FR-707: 회원 등급·정보(표시 이름, role, status, 온보딩 정보)로 수정 범위 한정.
// 권한 3단계: 최고관리자(super_admin, 지정 이메일 1인)만 최고관리자를
// 부여·해제하거나 최고관리자 본인 행을 수정할 수 있다. 관리자(admin)는
// 그 외 회원을 일반회원 ↔ 관리자로만 전환할 수 있다.
export async function adminUpdateMemberInfo(
  memberId: string,
  patch: {
    display_name?: string;
    role?: "user" | "admin" | "super_admin";
    status?: "active" | "suspended" | "withdrawn";
    real_name?: string | null;
    region?: string | null;
    phone?: string | null;
    school_name?: string | null;
  },
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { data: before } = await client
    .from("profiles")
    .select("display_name, role, status, email")
    .eq("id", memberId)
    .single<{ display_name: string | null; role: Role; status: string; email: string }>();

  // 최고관리자 본인의 행은 최고관리자만 수정할 수 있다(어떤 필드든).
  if (before?.role === "super_admin" && admin.role !== "super_admin") {
    return { ok: false, message: "최고관리자의 정보는 최고관리자만 수정할 수 있습니다." };
  }

  if (patch.role === "super_admin") {
    if (admin.role !== "super_admin") {
      return { ok: false, message: "최고관리자 권한은 최고관리자만 부여할 수 있습니다." };
    }
    if (before?.email !== SUPER_ADMIN_EMAIL) {
      return { ok: false, message: "최고관리자 권한은 지정된 계정에만 부여할 수 있습니다." };
    }
  }

  const { error } = await client.from("profiles").update(patch).eq("id", memberId);
  if (error) {
    if (error.code === "23514") {
      return { ok: false, message: "최고관리자 권한은 지정된 계정에만 부여할 수 있습니다." };
    }
    return { ok: false, message: "처리에 실패했습니다." };
  }

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "update_member_info",
    target_table: "profiles",
    target_id: memberId,
    before,
    after: patch,
  });

  revalidatePath("/admin/records");
  return { ok: true };
}

// FR-306: 부적절한 댓글 숨김/해제
export async function adminToggleCommentVisibility(
  commentId: string,
  status: "active" | "hidden",
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { error } = await client.from("comments").update({ status }).eq("id", commentId);
  if (error) return { ok: false, message: "처리에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: status === "hidden" ? "hide_comment" : "unhide_comment",
    target_table: "comments",
    target_id: commentId,
  });

  revalidatePath("/admin/records");
  return { ok: true };
}

// FR-711: 전체 재판정 수동 실행
export async function adminReevaluateAll(): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { data, error } = await client.rpc("admin_reevaluate_all");
  if (error) return { ok: false, message: "재판정 실행에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "reevaluate_all",
    target_table: "profiles",
    after: { count: data },
  });

  revalidatePath("/admin/records");
  return { ok: true, count: data as number };
}

// 관리자가 이메일+비밀번호로 회원 계정을 직접 만든다. Supabase Admin API로
// auth.users를 생성하면 on_auth_user_created 트리거가 profiles 행을 자동으로
// 만들어준다. 관리자가 직접 만든 계정은 승인 대기 없이 바로 approved로 둔다.
export async function adminCreateMember(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();

  if (!email || !input.password) {
    return { ok: false, message: "이메일과 비밀번호를 입력해 주세요." };
  }
  if (input.password.length < 8) {
    return { ok: false, message: "비밀번호는 8자 이상이어야 합니다." };
  }

  const { data, error } = await client.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: displayName ? { full_name: displayName } : undefined,
  });

  if (error || !data.user) {
    if (error?.message?.toLowerCase().includes("already been registered")) {
      return { ok: false, message: "이미 등록된 이메일입니다." };
    }
    return { ok: false, message: "회원 생성에 실패했습니다." };
  }

  await client
    .from("profiles")
    .update({ approval_status: "approved", approved_at: new Date().toISOString(), approved_by: admin.id })
    .eq("id", data.user.id);

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "create_member",
    target_table: "profiles",
    target_id: data.user.id,
    after: { email, display_name: displayName || null },
  });

  revalidatePath("/admin/records");
  return { ok: true };
}

// 비밀번호 재설정 — Supabase는 기존 비밀번호를 어떤 API로도 노출하지 않으므로
// "조회"는 원천적으로 불가능하고, 새 값으로 덮어쓰는 것만 가능하다.
export async function adminSetPassword(memberId: string, newPassword: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const client = createAdminClient();

  if (newPassword.length < 8) {
    return { ok: false, message: "비밀번호는 8자 이상이어야 합니다." };
  }

  const { data: target } = await client.from("profiles").select("role").eq("id", memberId).single();
  if (target?.role === "super_admin" && admin.role !== "super_admin") {
    return { ok: false, message: "최고관리자의 비밀번호는 최고관리자만 변경할 수 있습니다." };
  }

  const { error } = await client.auth.admin.updateUserById(memberId, { password: newPassword });
  if (error) return { ok: false, message: "비밀번호 변경에 실패했습니다." };

  await client.from("audit_log").insert({
    admin_id: admin.id,
    action: "reset_password",
    target_table: "profiles",
    target_id: memberId,
  });

  return { ok: true };
}
