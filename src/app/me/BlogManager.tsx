"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBlogPosts, deleteBlogPost } from "@/app/me/actions";
import type { BlogPost } from "@/lib/types";

const MAX_ROWS = 10;

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

interface InputRow {
  id: number;
  url: string;
  title: string;
  error?: string;
}

let rowSeq = 0;
function emptyRow(): InputRow {
  rowSeq += 1;
  return { id: rowSeq, url: "", title: "" };
}

interface BlogManagerProps {
  posts: BlogPost[];
  disabled: boolean;
}

export default function BlogManager({ posts, disabled }: BlogManagerProps) {
  const [rows, setRows] = useState<InputRow[]>([emptyRow()]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const visiblePosts = posts.filter((p) => p.status !== "deleted");

  function updateRow(id: number, patch: Partial<InputRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, emptyRow()]));
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  function handleSave() {
    setFormMessage(null);

    const filled = rows.filter((r) => r.url.trim().length > 0);
    if (filled.length === 0) {
      setFormMessage("등록할 게시물을 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      const result = await createBlogPosts(filled.map((r) => ({ url: r.url, title: r.title.trim() || null })));

      if (result.ok) {
        setRows([emptyRow()]);
        router.refresh();
        return;
      }

      if (result.rowErrors) {
        const filledIds = filled.map((r) => r.id);
        setRows((prev) =>
          prev.map((r) => {
            const idx = filledIds.indexOf(r.id);
            return idx >= 0 && result.rowErrors?.[idx] ? { ...r, error: result.rowErrors[idx] } : r;
          }),
        );
      }
      if (result.message) setFormMessage(result.message);
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
            <div className="flex flex-col gap-3">
              {rows.map((row, i) => (
                <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <input
                    type="text"
                    placeholder="블로그 주소 (https://...)"
                    value={row.url}
                    onChange={(e) => updateRow(row.id, { url: e.target.value })}
                    className="input-field flex-1 px-4 text-sm"
                    aria-label={`블로그 주소 ${i + 1}`}
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="게시물 제목 (선택)"
                      value={row.title}
                      onChange={(e) => updateRow(row.id, { title: e.target.value })}
                      className="input-field flex-1 px-4 text-sm sm:w-56"
                      aria-label={`게시물 제목 ${i + 1}`}
                    />

                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-danger"
                        aria-label="입력 행 삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {row.error && <p className="text-xs text-danger sm:hidden">{row.error}</p>}
                </div>
              ))}
            </div>

            {rows.some((r) => r.error) && (
              <ul className="hidden flex-col gap-1 sm:flex">
                {rows.map(
                  (r, i) =>
                    r.error && (
                      <li key={r.id} className="text-xs text-danger">
                        {i + 1}번째 줄: {r.error}
                      </li>
                    ),
                )}
              </ul>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= MAX_ROWS}
                className="text-sm font-medium text-teal-deep disabled:text-muted"
              >
                + 추가 입력
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="btn rounded-[10px] bg-teal px-6 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "저장 중..." : "저장"}
              </button>
            </div>

            {formMessage && <p className="text-sm text-danger">{formMessage}</p>}
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
