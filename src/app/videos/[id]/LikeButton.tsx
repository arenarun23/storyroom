"use client";

import { useState, useTransition } from "react";
import { toggleLike } from "@/app/videos/[id]/actions";

interface LikeButtonProps {
  videoId: string;
  initialLiked: boolean;
  initialCount: number;
  disabledSelf: boolean;
}

export default function LikeButton({ videoId, initialLiked, initialCount, disabledSelf }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));

    startTransition(async () => {
      const result = await toggleLike(videoId);
      if (!result.ok) {
        setLiked(!nextLiked);
        setCount((c) => c + (nextLiked ? -1 : 1));
        setError(result.message);
      } else if (result.liked !== undefined) {
        setLiked(result.liked);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || disabledSelf}
        className={`chip flex items-center gap-2 px-5 text-sm font-semibold disabled:opacity-50 ${
          liked ? "bg-teal text-white" : "border border-line text-ink"
        }`}
        title={disabledSelf ? "자기 영상에는 좋아요를 누를 수 없습니다" : undefined}
      >
        <span>{liked ? "♥" : "♡"}</span>
        <span className="font-mono">{count}</span>
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
