"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAdminRole } from "@/lib/roles";

// SCR-10 관리자 로그인 (FR-103: 이메일+비밀번호, 구글 로그인과 별도 경로)
export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();

    if (!isAdminRole(profile?.role)) {
      await supabase.auth.signOut();
      setError("관리자 계정이 아닙니다.");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-ink px-6 py-16">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-title text-xl font-bold text-white">스토리룸 교사 그룹</h1>
        <p className="text-sm text-white/60">관리자 로그인</p>
      </div>

      <form onSubmit={handleSubmit} className="card flex w-full max-w-sm flex-col gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">이메일</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field px-4 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">비밀번호</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field px-4 text-sm"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn rounded-[10px] bg-teal px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
