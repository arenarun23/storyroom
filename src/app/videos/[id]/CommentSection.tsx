"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createComment } from "@/app/videos/[id]/actions";
import { formatDateKST } from "@/lib/format";
import type { Comment } from "@/lib/types";

const MIN_LENGTH = 10;

interface CommentSectionProps {
  videoId: string;
  initialComments: Comment[];
}

// §4.5 댓글 스레드 + 작성 폼(10자 이상). 탈퇴 회원 댓글은 "탈퇴한 회원"으로 표시.
export default function CommentSection({ videoId, initialComments }: CommentSectionProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    setError(null);
    if (content.trim().length < MIN_LENGTH) {
      setError(`댓글은 ${MIN_LENGTH}자 이상 입력해 주세요`);
      return;
    }

    startTransition(async () => {
      const result = await createComment(videoId, content);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setContent("");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-title text-lg font-bold text-ink">댓글 {initialComments.length}</h2>

      <div className="flex flex-col gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`댓글을 입력해 주세요 (${MIN_LENGTH}자 이상)`}
          rows={3}
          className="input-field h-auto py-3 px-4 text-sm"
        />
        <div className="flex items-center justify-between">
          {error ? <p className="text-xs text-danger">{error}</p> : <span />}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="btn rounded-[10px] bg-teal px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            등록
          </button>
        </div>
      </div>

      {initialComments.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">첫 댓글을 남겨보세요.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {initialComments.map((comment) => (
            <li key={comment.id} className="card p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  {comment.actor_id ? (comment.profiles?.display_name ?? "이름 없음") : "탈퇴한 회원"}
                </span>
                <span className="text-xs text-muted">
                  {formatDateKST(comment.created_at)}
                </span>
              </div>
              <p className="text-sm text-ink">{comment.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
