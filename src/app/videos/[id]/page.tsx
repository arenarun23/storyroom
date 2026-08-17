import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import LikeButton from "@/app/videos/[id]/LikeButton";
import CommentSection from "@/app/videos/[id]/CommentSection";
import { formatDuration } from "@/lib/format";
import { isAdminRole } from "@/lib/roles";
import type { Comment, Level } from "@/lib/types";

// SCR-07 영상 상세
export default async function VideoDetailPage(props: PageProps<"/videos/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: levels }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, role").eq("id", user.id).single(),
    supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
  ]);

  const { data: video } = await supabase
    .from("videos")
    .select("*, profiles(display_name, current_level)")
    .eq("id", id)
    .maybeSingle();

  if (!video) notFound();

  const isRemoved = video.status !== "active";
  const isOwner = video.owner_id === user.id;

  const [{ count: likeCount }, { data: myLike }, { data: comments }] = isRemoved
    ? [{ count: 0 }, { data: null }, { data: [] }]
    : await Promise.all([
        supabase.from("likes").select("*", { count: "exact", head: true }).eq("video_id", id),
        supabase.from("likes").select("id").eq("video_id", id).eq("actor_id", user.id).maybeSingle(),
        supabase
          .from("comments")
          .select("id, video_id, actor_id, content, status, created_at, profiles(display_name)")
          .eq("video_id", id)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .returns<Comment[]>(),
      ]);

  const ownerLevel = levels?.find((l) => l.code === video.profiles?.current_level);
  const title = video.title || (video.platform === "youtube" ? "YouTube 영상" : "스토리룸 영상");

  return (
    <AppShell
      displayName={profile?.display_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      isAdmin={isAdminRole(profile?.role)}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        {isRemoved ? (
          <div className="card p-16 text-center text-sm text-muted">
            {video.status === "withdrawn"
              ? "사용자가 계정을 삭제하여 내용을 확인할 수 없습니다."
              : "작성자가 영상을 삭제하여 내용을 확인할 수 없습니다."}
          </div>
        ) : (
          <>
            <div className="card overflow-hidden p-0">
              {video.platform === "youtube" && video.yt_video_id ? (
                <div className="aspect-video w-full">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${video.yt_video_id}`}
                    title={title}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <video
                  controls
                  preload="metadata"
                  className="aspect-video w-full bg-ink"
                  src={video.url ?? undefined}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="font-title text-xl font-bold text-ink">{title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>{video.profiles?.display_name ?? "이름 없음"} 선생님</span>
                {ownerLevel && (
                  <span className="chip bg-teal-soft px-3 text-xs font-semibold text-teal-deep">
                    {ownerLevel.name}
                  </span>
                )}
                <span>{new Date(video.created_at).toLocaleDateString("ko-KR")}</span>
                <span className="font-mono">{formatDuration(video.duration_sec)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <LikeButton
                videoId={video.id}
                initialLiked={!!myLike}
                initialCount={likeCount ?? 0}
                disabledSelf={isOwner}
              />
              {video.url && (
                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="chip border border-line px-4 text-sm font-semibold text-ink"
                >
                  원본 열기
                </a>
              )}
            </div>

            <CommentSection videoId={video.id} initialComments={comments ?? []} />
          </>
        )}
      </div>
    </AppShell>
  );
}
