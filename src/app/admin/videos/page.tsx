import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import VideoReviewClient, { type AdminVideoRow } from "@/app/admin/videos/VideoReviewClient";

// 영상 검토 — 거절/삭제된 영상을 포함해 등록된 영상을 상태별로 확인한다
export default async function AdminVideosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const [{ data: videos }, { data: members }] = await Promise.all([
    supabase
      .from("videos")
      .select(
        "id, owner_id, platform, title, url, duration_sec, status, is_flagged, created_at, profiles(display_name, email)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, display_name, email")
      .eq("approval_status", "approved")
      .eq("status", "active")
      .order("display_name"),
  ]);

  return (
    <AdminShell email={user.email ?? ""}>
      <VideoReviewClient
        videos={(videos as unknown as AdminVideoRow[]) ?? []}
        members={members ?? []}
      />
    </AdminShell>
  );
}
