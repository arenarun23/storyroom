import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import LevelBadge from "@/components/LevelBadge";
import { VideoRegisterForm, VideoList } from "@/app/me/VideoManager";
import BlogManager from "@/app/me/BlogManager";
import MonthlyChart from "@/app/me/MonthlyChart";
import ProfileInfoEditor from "@/app/me/ProfileInfoEditor";
import {
  METRIC_LABELS,
  formatDateKST,
  formatDday,
  formatDuration,
  isPast,
  isWithinWarningWindow,
} from "@/lib/format";
import { isAdminRole } from "@/lib/roles";
import type { BlogPost, Level, Profile, Video } from "@/lib/types";

interface UserMetrics {
  video_count: number;
  total_duration_min: number;
  yt_video_count: number;
  yt_views: number;
  yt_likes: number;
  yt_comments: number;
  received_likes: number;
  received_comments: number;
  given_likes: number;
  given_comments: number;
}

export default async function MePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: levels }, { data: metrics }, { data: videos }, { data: blogPosts }, { data: warnDaysCfg }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
      supabase.from("levels").select("*").order("order_no").returns<Level[]>(),
      supabase.rpc("my_metrics").single<UserMetrics>(),
      supabase
        .from("videos")
        .select("*")
        .eq("owner_id", user.id)
        .in("status", ["active", "pending", "rejected"])
        .order("created_at", { ascending: false })
        .returns<Video[]>(),
      supabase
        .from("blog_posts")
        .select("*")
        .eq("owner_id", user.id)
        .in("status", ["active", "pending", "rejected"])
        .order("created_at", { ascending: false })
        .returns<BlogPost[]>(),
      supabase.from("app_config").select("value").eq("key", "retention_warning_days").single(),
    ]);

  if (!profile) redirect("/login");

  const activeVideos = (videos ?? []).filter((v) => v.status === "active");

  const currentLevel = levels?.find((l) => l.code === profile.current_level);
  const nextLevel = levels?.find((l) => l.order_no === (currentLevel?.order_no ?? 0) + 1 && l.is_active);

  const { data: promotionRules } = nextLevel
    ? await supabase
        .from("level_rules")
        .select("*")
        .eq("target_level", nextLevel.code)
        .eq("rule_type", "promotion")
        .eq("is_active", true)
    : { data: null };

  const m = metrics ?? {
    video_count: 0,
    total_duration_min: 0,
    yt_video_count: 0,
    yt_views: 0,
    yt_likes: 0,
    yt_comments: 0,
    received_likes: 0,
    received_comments: 0,
    given_likes: 0,
    given_comments: 0,
  };

  const metricValue = (key: string) => (m as unknown as Record<string, number>)[key] ?? 0;

  const ratios =
    promotionRules?.map((rule) => {
      const value = metricValue(rule.metric_key);
      return Math.min(value / rule.threshold, 1);
    }) ?? [];
  const overallProgress = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : undefined;

  const isPending = profile.approval_status === "pending";
  const isCoolingDown =
    profile.promotion_locked_until != null && !isPast(profile.promotion_locked_until);
  const warnDays = Number(warnDaysCfg?.value ?? 30);
  const expiresAt = profile.level_expires_at ? new Date(profile.level_expires_at) : null;
  const showExpiryWarning =
    !!profile.level_expires_at && isWithinWarningWindow(profile.level_expires_at, warnDays);

  return (
    <AppShell
      displayName={profile.display_name}
      avatarUrl={profile.avatar_url}
      email={profile.email}
      isAdmin={isAdminRole(profile.role)}
    >
      <div className="flex flex-col gap-6">
        <h1 className="font-title text-xl font-bold text-ink">
          {profile.display_name ?? "선생님"}님, 반갑습니다
        </h1>

        {isPending && (
          <p className="banner bg-gold-soft px-4 py-3 text-sm text-gold">
            승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다.
          </p>
        )}

        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          {currentLevel && (
            <LevelBadge level={currentLevel} progress={nextLevel ? overallProgress : undefined} />
          )}

          {currentLevel && currentLevel.order_no > 0 ? (
            <div className="flex flex-col items-center gap-1">
              <p className="font-title text-lg font-bold text-ink">{currentLevel.name}</p>
              {expiresAt && (
                <p className="font-mono text-sm text-muted">
                  유지 만료 {formatDday(profile.level_expires_at!)} ({formatDateKST(profile.level_expires_at!)})
                </p>
              )}
            </div>
          ) : (
            <p className="max-w-xs text-sm text-muted">
              제작한 영상 링크를 입력하고 레벨을 올려보세요.
            </p>
          )}
        </section>

        {isCoolingDown && (
          <p className="banner bg-gold-soft px-4 py-3 text-sm text-gold">
            복귀 심사까지 {formatDday(profile.promotion_locked_until!).replace("D-", "")}일 남았습니다.
          </p>
        )}

        {showExpiryWarning && !isCoolingDown && (
          <p className="banner bg-gold-soft px-4 py-3 text-sm text-gold">
            등급 유지 기준 만료가 임박했습니다. {formatDateKST(profile.level_expires_at!)}까지 활동을 이어가 주세요.
          </p>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="영상 수" value={String(m.video_count)} />
          <SummaryCard label="누적 시간" value={formatDuration(m.total_duration_min * 60)} />
          <SummaryCard label="받은 좋아요" value={String(m.received_likes)} muted />
          <SummaryCard label="받은 댓글" value={String(m.received_comments)} muted />
        </section>

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal" />
            영상 수 · 누적 시간은 등급 판정에 반영됩니다
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-line" />
            좋아요 · 댓글은 기록용이며 등급 판정에 사용되지 않습니다
          </span>
        </p>

        {nextLevel && promotionRules && promotionRules.length > 0 && (
          <section className="card flex flex-col gap-4 p-6">
            <h2 className="font-title text-lg font-bold text-ink">{nextLevel.name}까지 남은 기준</h2>
            {promotionRules.map((rule) => {
              const value = metricValue(rule.metric_key);
              const ratio = Math.min(value / rule.threshold, 1);
              const isYoutube = rule.metric_key.startsWith("yt_");
              return (
                <div key={rule.id} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-ink">{METRIC_LABELS[rule.metric_key] ?? rule.metric_key}</span>
                    <span className="font-mono text-muted">
                      {rule.metric_key === "total_duration_min"
                        ? `${formatDuration(value * 60)} / ${formatDuration(rule.threshold * 60)}`
                        : `${Math.round(value)} / ${rule.threshold}`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className={`h-full rounded-full ${isYoutube ? "bg-youtube" : "bg-teal"}`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <VideoRegisterForm disabled={isPending} />

        {currentLevel?.code === "L2" && <BlogManager posts={blogPosts ?? []} disabled={isPending} />}

        <VideoList videos={videos ?? []} />

        {activeVideos.length > 0 && <MonthlyChart videos={activeVideos} />}

        {currentLevel?.benefits && (
          <section className="card p-6">
            <h2 className="font-title mb-2 text-lg font-bold text-ink">{currentLevel.name} 혜택</h2>
            <p className="text-sm text-muted">{currentLevel.benefits}</p>
          </section>
        )}

        <ProfileInfoEditor
          realName={profile.real_name}
          region={profile.region}
          phone={profile.phone}
          schoolName={profile.school_name}
        />

        <div className="flex justify-center pt-4">
          <Link href="/me/withdraw" className="text-xs text-muted hover:text-danger">
            회원 탈퇴
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="font-mono text-2xl font-bold text-ink">{value}</span>
      <span className={`text-xs ${muted ? "text-muted" : "text-teal-deep"}`}>{label}</span>
    </div>
  );
}
