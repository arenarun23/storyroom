import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import FeedClient from "@/app/videos/FeedClient";
import { isAdminRole } from "@/lib/roles";
import type { Level } from "@/lib/types";

// SCR-06 영상 피드
export default async function VideosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: levels }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, role").eq("id", user.id).single(),
    supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
  ]);

  return (
    <AppShell
      displayName={profile?.display_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      isAdmin={isAdminRole(profile?.role)}
    >
      <div className="flex flex-col gap-6">
        <h1 className="font-title text-xl font-bold text-ink">영상 피드</h1>
        <FeedClient levels={levels ?? []} />
      </div>
    </AppShell>
  );
}
