"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// FR-301~303: 좋아요 토글. 자기 영상 차단(trg_block_self_like)과 중복 방지
// (UNIQUE 제약)는 DB에서 강제되며, 여기서는 사용자에게 보여줄 메시지로 변환한다.
export async function toggleLike(videoId: string): Promise<ActionResult & { liked?: boolean }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { data: existing } = await supabase
    .from("likes")
    .select("id")
    .eq("video_id", videoId)
    .eq("actor_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("likes").delete().eq("id", existing.id);
    if (error) return { ok: false, message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
    revalidatePath(`/videos/${videoId}`);
    return { ok: true, liked: false };
  }

  const { error } = await supabase.from("likes").insert({ video_id: videoId, actor_id: user.id });
  if (error) {
    if (error.message.includes("자기 영상")) {
      return { ok: false, message: "자기 영상에는 좋아요를 누를 수 없습니다" };
    }
    if (error.code === "23505") {
      revalidatePath(`/videos/${videoId}`);
      return { ok: true, liked: true };
    }
    return { ok: false, message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
  }

  revalidatePath(`/videos/${videoId}`);
  return { ok: true, liked: true };
}

// FR-304: 최소 글자수(기본 10자)는 trg_validate_comment가 강제한다
export async function createComment(videoId: string, content: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("comments")
    .insert({ video_id: videoId, actor_id: user.id, content: content.trim() });

  if (error) {
    if (error.message.includes("자 이상")) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
  }

  revalidatePath(`/videos/${videoId}`);
  return { ok: true };
}
