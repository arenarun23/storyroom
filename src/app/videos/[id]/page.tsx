import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import LikeButton from "@/app/videos/[id]/LikeButton";
import CommentSection from "@/app/videos/[id]/CommentSection";
import { formatDateKST, formatDuration } from "@/lib/format";
import { isAdminRole } from "@/lib/roles";
import type { Comment, Level } from "@/lib/types";

interface ProfileCard {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  current_level: string | null;
}

// SCR-07 영상 상세
export default async function VideoDetailPage(props: PageProps<"/videos/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: levels }, { data: video }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, role").eq("id", user.id).single(),
    supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
    supabase.from("videos").select("*").eq("id", id).maybeSingle(),
  ]);

  if (!video) notFound();

  const isRemoved = video.status !== "active";
  const isOwner = video.owner_id === user.id;

  // profiles_select가 본인/관리자로 좁혀져 있어, 영상 작성자·댓글 작성자처럼
  // 다른 회원의 표시이름/등급이 필요한 곳은 public_profile_card를 거친다.
  const [{ data: ownerCards }, { count: likeCount }, { data: myLike }, { data: rawComments }] = isRemoved
    ? [{ data: null }, { count: 0 }, { data: null }, { data: [] }]
    : await Promise.all([
        video.owner_id
          ? supabase.rpc("public_profile_card", { p_ids: [video.owner_id] })
          : Promise.resolve({ data: null }),
        supabase.from("likes").select("*", { count: "exact", head: true }).eq("video_id", id),
        supabase.from("likes").select("id").eq("video_id", id).eq("actor_id", user.id).maybeSingle(),
        supabase
          .from("comments")
          .select("id, video_id, actor_id, content, status, created_at")
          .eq("video_id", id)
          .eq("status", "active")
          .order("created_at", { ascending: true }),
      ]);

  const ownerCard = ((ownerCards as ProfileCard[] | null) ?? [])[0] ?? null;

  const commentActorIds = [...new Set((rawComments ?? []).map((c) => c.actor_id).filter((v): v is string => !!v))];
  const { data: actorCards } = commentActorIds.length
    ? await supabase.rpc("public_profile_card", { p_ids: commentActorIds })
    : { data: [] as ProfileCard[] };
  const actorMap = new Map(((actorCards as ProfileCard[] | null) ?? []).map((c) => [c.id, c]));
  const comments: Comment[] = (rawComments ?? []).map((c) => ({
    ...c,
    profiles: c.actor_id ? { display_name: actorMap.get(c.actor_id)?.display_name ?? null } : null,
  }));

  const ownerLevel = levels?.find((l) => l.code === ownerCard?.current_level);
  const title = video.title || (video.platform === "youtube" ? "YouTube 영상" : "스토리룸 영상");

  return (
    <AppShell
      displayName={profile?.display_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      email={user.email ?? ""}
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
                <span>{ownerCard?.display_name ?? "이름 없음"} 선생님</span>
                {ownerLevel && (
                  <span className="chip bg-teal-soft px-3 text-xs font-semibold text-teal-deep">
                    {ownerLevel.name}
                  </span>
                )}
                <span>{formatDateKST(video.created_at)}</span>
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

            <CommentSection videoId={video.id} initialComments={comments} />
          </>
        )}
      </div>
    </AppShell>
  );
}
