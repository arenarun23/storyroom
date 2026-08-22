import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/AdminShell";
import BlogReviewClient, { type AdminBlogPostRow } from "@/app/admin/blog/BlogReviewClient";

// 블로그 게시물 검토 — 거절/삭제된 게시물을 포함해 등록된 게시물을 상태별로 확인한다
export default async function AdminBlogPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, owner_id, title, url, status, created_at, owner:profiles!owner_id(display_name, email)")
    .order("created_at", { ascending: false });

  return (
    <AdminShell email={user.email ?? ""}>
      <BlogReviewClient posts={(posts as unknown as AdminBlogPostRow[]) ?? []} />
    </AdminShell>
  );
}
