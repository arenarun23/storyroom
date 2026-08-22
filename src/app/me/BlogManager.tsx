"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBlogPost, deleteBlogPost } from "@/app/me/actions";
import type { BlogPost } from "@/lib/types";

const STATUS_LABEL: Record<BlogPost["status"], string> = {
  active: "승인됨",
  pending: "승인 대기",
  rejected: "거절됨",
  deleted: "삭제됨",
  withdrawn: "탈퇴 회원",
};

const STATUS_CLASS: Record<BlogPost["status"], string> = {
  active: "border-teal/40 bg-teal-soft text-teal-deep",
  pending: "border-gold/40 bg-gold-soft text-gold",
  rejected: "border-danger/40 bg-danger/10 text-danger",
  deleted: "border-line text-muted",
  withdrawn: "border-line text-muted",
};

interface BlogManagerProps {
  posts: BlogPost[];
  disabled: boolean;
}

export default function BlogManager({ posts, disabled }: BlogManagerProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const visiblePosts = posts.filter((p) => p.status !== "deleted");

  function handleSave() {
    setError(null);
    if (!url.trim()) {
      setError("블로그 주소를 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const result = await createBlogPost(url, title || null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUrl("");
      setTitle("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-4 p-6">
        <h2 className="font-title text-lg font-bold text-ink">스토리룸 홍보 블로그 게시물</h2>

        {disabled ? (
          <p className="banner bg-gold-soft px-4 py-3 text-sm text-gold">
            승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="블로그 주소 (https://...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="input-field flex-1 px-4 text-sm"
                aria-label="블로그 주소"
              />
              <input
                type="text"
                placeholder="게시물 제목 (선택)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field px-4 text-sm sm:w-56"
                aria-label="게시물 제목"
              />
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="btn self-start rounded-[10px] bg-teal px-6 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "저장 중..." : "저장"}
            </button>
          </>
        )}
      </section>

      {visiblePosts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">내 블로그 게시물 목록</h3>
          <div className="flex flex-col gap-3">
            {visiblePosts.map((post) => (
              <BlogPostRow key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BlogPostRow({ post }: { post: BlogPost }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!window.confirm("이 게시물을 삭제할까요?")) return;
    startTransition(async () => {
      await deleteBlogPost(post.id);
      router.refresh();
    });
  }

  return (
    <div className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip border px-3 text-xs font-semibold ${STATUS_CLASS[post.status]}`}>
            {STATUS_LABEL[post.status]}
          </span>
          {post.title && <span className="text-sm font-medium text-ink">{post.title}</span>}
        </div>
        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm text-muted hover:text-teal-deep"
          >
            {post.url}
          </a>
        )}
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="chip shrink-0 border border-line px-4 text-xs font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "처리 중..." : "삭제"}
      </button>
    </div>
  );
}
