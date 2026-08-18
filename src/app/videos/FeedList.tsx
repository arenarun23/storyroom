"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchFeedPage, type FeedCursor } from "@/app/videos/actions";
import VideoCard from "@/components/VideoCard";
import type { FeedVideo, Level, SortOption } from "@/lib/types";

interface FeedListProps {
  sort: SortOption;
  levelFilter: string;
  levels: Level[];
}

// 정렬/필터를 바꾸면 부모(FeedClient)가 이 컴포넌트를 새 key로 리마운트한다.
// 그래서 여기서는 "이전 목록을 초기화"하는 effect가 필요 없고, 마운트 시
// 첫 페이지를 불러오는 단순한 데이터 패칭 effect만 있으면 된다.
export default function FeedList({ sort, levelFilter, levels }: FeedListProps) {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    setLoading(true);
    const { videos: page, nextCursor } = await fetchFeedPage(sort, levelFilter || null, cursor);
    setVideos((prev) => [...prev, ...page]);
    setCursor(nextCursor);
    setHasMore(nextCursor !== null);
    setLoading(false);
  }, [sort, levelFilter, cursor]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { videos: page, nextCursor } = await fetchFeedPage(sort, levelFilter || null, null);
      if (cancelled) return;
      setVideos(page);
      setCursor(nextCursor);
      setHasMore(nextCursor !== null);
      setLoading(false);
      setInitialized(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [sort, levelFilter]);

  // 커서 기반 무한 스크롤 (FR-308)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !initialized) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        loadMore();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, initialized, loadMore]);

  if (initialized && videos.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-16 text-center">
        <p className="text-sm text-muted">아직 등록된 영상이 없습니다.</p>
        <Link href="/me" className="text-sm font-semibold text-teal-deep">
          영상 등록하러 가기
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-5 gap-2">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} levels={levels} />
        ))}
      </div>
      <div ref={sentinelRef} className="h-1" />
      {loading && <p className="pb-4 text-center text-xs text-muted">불러오는 중...</p>}
    </>
  );
}
