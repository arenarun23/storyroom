import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import ActivityFeedClient from "@/app/admin/activity/ActivityFeedClient";

// SCR-19 회원 활동 통합 조회 (최고관리자 전용) — 로그인 기록 + 영상 등록 +
// 댓글 + 좋아요를 한 화면에서 시간순으로 확인한다.
export default async function AdminActivityPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: viewerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (viewerProfile?.role !== "super_admin") redirect("/admin");

  const [{ data: feed }, { data: members }] = await Promise.all([
    supabase.rpc("admin_activity_feed", { p_limit: 50, p_before: null, p_user: null }),
    supabase.from("profiles").select("id, display_name, email").order("display_name"),
  ]);

  return (
    <AdminShell email={user.email ?? ""}>
      <ActivityFeedClient initialRows={feed ?? []} members={members ?? []} />
    </AdminShell>
  );
}
