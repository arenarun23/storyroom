"use server";

import { createClient } from "@/lib/supabase/server";
import type { FeedVideo, SortOption } from "@/lib/types";

export interface FeedCursor {
  metric: number | null;
  createdAt: string | null;
  id: string | null;
}

const PAGE_SIZE = 20;

// FR-307/308: 정렬(최신·좋아요·댓글순) + 커서 기반 무한 스크롤(1회 20건)
export async function fetchFeedPage(
  sort: SortOption,
  level: string | null,
  cursor: FeedCursor | null,
): Promise<{ videos: FeedVideo[]; nextCursor: FeedCursor | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("list_videos_feed", {
    p_sort: sort,
    p_level: level,
    p_cursor_metric: cursor?.metric ?? null,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: PAGE_SIZE,
  });

  if (error || !data) {
    return { videos: [], nextCursor: null };
  }

  const videos = data as FeedVideo[];
  const last = videos[videos.length - 1];

  const nextCursor: FeedCursor | null =
    videos.length === PAGE_SIZE && last
      ? {
          metric: sort === "likes" ? last.like_count : sort === "comments" ? last.comment_count : null,
          createdAt: last.created_at,
          id: last.id,
        }
      : null;

  return { videos, nextCursor };
}
