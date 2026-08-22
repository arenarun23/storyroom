// 시방서 §6.2 데이터 명세 기준 도메인 타입

export type Role = "user" | "admin" | "super_admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ProfileStatus = "active" | "suspended" | "withdrawn";
export type Platform = "storyroom" | "youtube";
export type DurationSource = "auto" | "manual" | "api";
export type VideoStatus = "active" | "pending" | "rejected" | "deleted" | "withdrawn" | "reset";

export interface Level {
  code: string;
  order_no: number;
  name: string;
  description: string | null;
  benefits: string | null;
  badge_color: string | null; // "fromHex,toHex"
  badge_image_url: string | null;
  has_retention: boolean;
  is_active: boolean;
  promotion_note: string | null;
  retention_note: string | null;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: Role;
  auth_provider: "google" | "email";
  approval_status: ApprovalStatus;
  current_level: string;
  level_updated_at: string;
  level_expires_at: string | null;
  promotion_locked_until: string | null;
  manual_override: boolean;
  status: ProfileStatus;
  yt_channel_id: string | null;
  yt_verify_code: string | null;
  yt_verified_at: string | null;
  last_active_at: string;
  created_at: string;
  real_name: string | null;
  region: string | null;
  phone: string | null;
  school_name: string | null;
}

export interface Video {
  id: string;
  owner_id: string | null;
  platform: Platform;
  title: string | null;
  url: string | null;
  url_key: string;
  duration_sec: number;
  duration_source: DurationSource;
  thumbnail_url: string | null;
  yt_video_id: string | null;
  yt_channel_id: string | null;
  yt_views: number;
  yt_likes: number;
  yt_comments: number;
  is_flagged: boolean;
  status: VideoStatus;
  created_at: string;
  updated_at: string;
}

export interface VideoInputRow {
  url: string;
  title: string | null;
  durationSec: number | null;
  durationSource: DurationSource;
}

export type CreateVideosResult =
  | { ok: true }
  | { ok: false; message?: string; rowErrors?: Record<number, string> };

export type ActionResult = { ok: true } | { ok: false; message: string };

export type SortOption = "latest" | "likes" | "comments";

// list_videos_feed RPC 반환 행 (sql/03_video_feed.sql)
export interface FeedVideo {
  id: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_level: string | null;
  platform: Platform;
  title: string | null;
  url: string | null;
  yt_video_id: string | null;
  duration_sec: number;
  status: VideoStatus;
  created_at: string;
  like_count: number;
  comment_count: number;
}

export interface Comment {
  id: string;
  video_id: string;
  actor_id: string | null;
  content: string;
  status: "active" | "hidden";
  created_at: string;
  profiles: { display_name: string | null } | null;
}

export type NotificationType = "promotion" | "demotion" | "expiry_warning" | "ai_comment" | "approval";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export interface LevelRule {
  id: string;
  target_level: string;
  rule_type: "promotion" | "retention";
  metric_key: string;
  operator: string;
  threshold: number;
  is_active: boolean;
  memo: string | null;
  sort_order: number;
}

export interface AppConfigRow {
  key: string;
  value: string;
  description: string | null;
}

export interface AuditLogRow {
  id: string;
  admin_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}

// admin_list_members() RPC 반환 행 (sql/04_admin.sql)
export interface AdminMemberRow {
  id: string;
  display_name: string | null;
  email: string;
  role: Role;
  current_level: string;
  level_updated_at: string;
  level_expires_at: string | null;
  promotion_locked_until: string | null;
  manual_override: boolean;
  status: ProfileStatus;
  approval_status: ApprovalStatus;
  yt_verified_at: string | null;
  last_active_at: string;
  created_at: string;
  video_count: number;
  total_duration_min: number;
  received_likes: number;
  received_comments: number;
  given_likes: number;
  given_comments: number;
  yt_views: number;
  flagged_count: number;
  real_name: string | null;
  region: string | null;
  phone: string | null;
  school_name: string | null;
}
