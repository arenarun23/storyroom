"use server";

import { requireAdmin } from "@/lib/supabase/adminAuth";
import { createClient } from "@/lib/supabase/server";

export interface ActivityRow {
  activity_type: "login" | "video" | "comment" | "like";
  user_id: string;
  display_name: string | null;
  email: string;
  created_at: string;
  detail: string | null;
}

// admin_activity_feed는 auth.uid() 기준으로 최고관리자인지 확인하므로
// service role이 아닌 세션 클라이언트로 호출해야 한다.
export async function fetchActivityFeed(
  cursor: string | null,
  userId: string | null,
): Promise<{ rows: ActivityRow[]; nextCursor: string | null }> {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") return { rows: [], nextCursor: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_activity_feed", {
    p_limit: 50,
    p_before: cursor,
    p_user: userId,
  });

  const rows = (error ? null : (data as ActivityRow[] | null)) ?? [];
  const nextCursor = rows.length === 50 ? rows[rows.length - 1].created_at : null;
  return { rows, nextCursor };
}
