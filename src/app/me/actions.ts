"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractYouTubeId, normalizeUrl } from "@/lib/format";
import type { ActionResult, CreateVideosResult, VideoInputRow } from "@/lib/types";

const URL_PATTERN = /^https?:\/\//i;
const MAX_ROWS = 10;

// §11.2 검증 순서: 로그인 → 승인 상태 → 행별 형식 → 입력 내 중복 →
// 기존 등록분 중복 → 플랫폼 판별 → 일괄 INSERT(트리거가 상한 검증·승급 판정)
export async function createVideos(rows: VideoInputRow[]): Promise<CreateVideosResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("approval_status")
    .eq("id", user.id)
    .single();

  if (profile?.approval_status !== "approved") {
    return { ok: false, message: "승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다." };
  }

  if (rows.length === 0) {
    return { ok: false, message: "등록할 영상을 입력해 주세요." };
  }
  if (rows.length > MAX_ROWS) {
    return { ok: false, message: `한 번에 최대 ${MAX_ROWS}편까지 등록할 수 있습니다.` };
  }

  type Parsed = { url: string; key: string; durationSec: number; platform: "storyroom" | "youtube" } | null;

  const rowErrors: Record<number, string> = {};

  const parsed: Parsed[] = rows.map((row) => {
    const url = row.url.trim();
    if (!URL_PATTERN.test(url)) return null;
    if (!row.durationSec || row.durationSec <= 0) return null;
    return {
      url,
      key: normalizeUrl(url),
      durationSec: row.durationSec,
      platform: extractYouTubeId(url) ? "youtube" : "storyroom",
    };
  });

  rows.forEach((row, i) => {
    if (parsed[i] !== null) return;
    rowErrors[i] = URL_PATTERN.test(row.url.trim())
      ? "재생시간을 자동으로 읽지 못했습니다. 직접 입력해 주세요."
      : "http(s):// 로 시작하는 링크를 넣어주세요";
  });

  // 입력 내 중복
  const byKey = new Map<string, number[]>();
  parsed.forEach((p, i) => {
    if (!p) return;
    const idxs = byKey.get(p.key) ?? [];
    idxs.push(i);
    byKey.set(p.key, idxs);
  });
  for (const idxs of byKey.values()) {
    if (idxs.length > 1) {
      idxs.forEach((i) => {
        rowErrors[i] = "같은 링크가 중복되었습니다";
      });
    }
  }

  // 기존 등록분 중복
  const candidateKeys = parsed
    .map((p, i) => (p && !rowErrors[i] ? p.key : null))
    .filter((k): k is string => k !== null);

  if (candidateKeys.length > 0) {
    const { data: existing } = await supabase
      .from("videos")
      .select("url_key")
      .in("url_key", candidateKeys);

    const existingSet = new Set((existing ?? []).map((v) => v.url_key as string));
    parsed.forEach((p, i) => {
      if (p && !rowErrors[i] && existingSet.has(p.key)) {
        rowErrors[i] = "이미 등록된 영상입니다";
      }
    });
  }

  if (Object.keys(rowErrors).length > 0) {
    return { ok: false, rowErrors };
  }

  const inserts = parsed.map((p, i) => ({
    owner_id: user.id,
    platform: p!.platform,
    title: rows[i].title?.trim() || null,
    url: p!.url,
    url_key: p!.key,
    duration_sec: p!.durationSec,
    duration_source: rows[i].durationSource,
    yt_video_id: p!.platform === "youtube" ? extractYouTubeId(p!.url) : null,
  }));

  const { error } = await supabase.from("videos").insert(inserts);

  if (error) {
    if (error.message.includes("영상 시간이 상한")) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
  }

  revalidatePath("/me");
  return { ok: true };
}

export async function updateVideo(
  id: string,
  input: { url?: string; title?: string | null; durationSec?: number },
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) {
    patch.title = input.title?.trim() || null;
  }

  if (input.url !== undefined) {
    const url = input.url.trim();
    if (!URL_PATTERN.test(url)) {
      return { ok: false, message: "http(s):// 로 시작하는 링크를 넣어주세요" };
    }
    patch.url = url;
    patch.url_key = normalizeUrl(url);
    patch.platform = extractYouTubeId(url) ? "youtube" : "storyroom";
    patch.yt_video_id = extractYouTubeId(url);
  }

  if (input.durationSec !== undefined) {
    if (!input.durationSec || input.durationSec <= 0) {
      return { ok: false, message: "재생시간을 확인해 주세요" };
    }
    patch.duration_sec = input.durationSec;
    patch.duration_source = "manual";
  }

  const { error } = await supabase
    .from("videos")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    if (error.message.includes("영상 시간이 상한")) {
      return { ok: false, message: error.message };
    }
    if (error.code === "23505") {
      return { ok: false, message: "이미 등록된 영상입니다" };
    }
    return { ok: false, message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
  }

  revalidatePath("/me");
  return { ok: true };
}

// FR-210: 소프트 삭제 (지표·타인의 상호작용 기록 보존)
export async function deleteVideo(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("videos")
    .update({ status: "deleted" })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return { ok: false, message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
  }

  revalidatePath("/me");
  return { ok: true };
}

// 스토리룸 홍보 블로그 게시물 등록. 영상 등록과 동일하게 승인 상태 확인 →
// 형식 검증 → 중복 확인 순으로 처리하고, 관리자 승인 대기(pending) 상태로 저장한다.
export async function createBlogPost(url: string, title: string | null): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("approval_status")
    .eq("id", user.id)
    .single();

  if (profile?.approval_status !== "approved") {
    return { ok: false, message: "승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다." };
  }

  const trimmedUrl = url.trim();
  if (!URL_PATTERN.test(trimmedUrl)) {
    return { ok: false, message: "http(s):// 로 시작하는 링크를 넣어주세요" };
  }

  const urlKey = normalizeUrl(trimmedUrl);
  const { data: existing } = await supabase
    .from("blog_posts")
    .select("id")
    .eq("url_key", urlKey)
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "이미 등록된 게시물입니다" };
  }

  const { error } = await supabase.from("blog_posts").insert({
    owner_id: user.id,
    title: title?.trim() || null,
    url: trimmedUrl,
    url_key: urlKey,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "이미 등록된 게시물입니다" };
    }
    return { ok: false, message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
  }

  revalidatePath("/me");
  return { ok: true };
}

export async function deleteBlogPost(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("blog_posts")
    .update({ status: "deleted" })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return { ok: false, message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };
  }

  revalidatePath("/me");
  return { ok: true };
}
