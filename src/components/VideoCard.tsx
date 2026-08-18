import Link from "next/link";
import { formatDateKST, formatDuration } from "@/lib/format";
import type { FeedVideo, Level } from "@/lib/types";

function youtubeThumbnail(id: string) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

interface VideoCardProps {
  video: FeedVideo;
  levels: Level[];
}

// §4.4 SCR-06 카드 규격: 썸네일(첫 프레임)·제목·작성자·등급·좋아요·댓글수·등록일.
// 삭제/탈퇴 영상은 회색 카드 + 안내 문구(FR-211, FR-212).
// 스토리룸 mp4는 <video preload="metadata">로 첫 프레임만 가볍게 내려받아
// 썸네일로 보여준다(전체 다운로드/자동재생 없음).
export default function VideoCard({ video, levels }: VideoCardProps) {
  const isRemoved = video.status !== "active";
  const level = levels.find((l) => l.code === video.owner_level);

  if (isRemoved) {
    return (
      <div className="card flex aspect-[4/5] flex-col items-center justify-center gap-2 bg-line/40 p-3 text-center opacity-80">
        <p className="text-xs text-muted">
          {video.status === "withdrawn"
            ? "사용자가 계정을 삭제하여 내용을 확인할 수 없습니다."
            : "작성자가 영상을 삭제하여 내용을 확인할 수 없습니다."}
        </p>
      </div>
    );
  }

  const title = video.title || (video.platform === "youtube" ? "YouTube 영상" : "스토리룸 영상");

  return (
    <Link href={`/videos/${video.id}`} className="card flex flex-col overflow-hidden p-0">
      <div className="aspect-video w-full bg-teal-soft">
        {video.platform === "youtube" && video.yt_video_id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={youtubeThumbnail(video.yt_video_id)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : video.url ? (
          <video
            src={video.url}
            className="h-full w-full object-cover"
            preload="metadata"
            muted
            playsInline
            aria-hidden="true"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-mono text-[10px] text-teal-deep">스토리룸 영상</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 p-2">
        <div className="flex items-center gap-1">
          {level && (
            <span className="chip bg-teal-soft px-1.5 text-[9px] font-semibold text-teal-deep">{level.name}</span>
          )}
          <span className="font-mono text-[10px] text-muted">{formatDuration(video.duration_sec)}</span>
        </div>

        <p className="truncate text-xs font-semibold text-ink">{title}</p>
        <p className="truncate text-[10px] text-muted">{video.owner_name ?? "이름 없음"} 선생님</p>

        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted">
          <span>♥ {video.like_count}</span>
          <span>💬 {video.comment_count}</span>
          <span className="ml-auto truncate">{formatDateKST(video.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
