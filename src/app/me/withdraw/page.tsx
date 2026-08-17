import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import WithdrawForm from "@/app/me/withdraw/WithdrawForm";
import { isAdminRole } from "@/lib/roles";

// SCR-04 회원 탈퇴
export default async function WithdrawPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, role")
    .eq("id", user.id)
    .single();

  return (
    <AppShell
      displayName={profile?.display_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      isAdmin={isAdminRole(profile?.role)}
    >
      <WithdrawForm email={user.email ?? ""} />
    </AppShell>
  );
}
