"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/app/onboarding/actions";
import { REGIONS } from "@/lib/regions";

interface OnboardingFormProps {
  initial: {
    real_name: string | null;
    region: string | null;
    phone: string | null;
    school_name: string | null;
  } | null;
}

export default function OnboardingForm({ initial }: OnboardingFormProps) {
  const [realName, setRealName] = useState(initial?.real_name ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [schoolName, setSchoolName] = useState(initial?.school_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding({ realName, region, phone, schoolName });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/me");
      router.refresh();
    });
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">
          성명 <span className="text-danger">*</span>
        </label>
        <input
          value={realName}
          onChange={(e) => setRealName(e.target.value)}
          placeholder="홍길동"
          className="input-field px-4 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">
          소속 시도 <span className="text-danger">*</span>
        </label>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="input-field px-3 text-sm">
          <option value="">선택해 주세요</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">
          연락처 <span className="text-danger">*</span>
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-1234-5678"
          className="input-field px-4 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">
          소속 학교 <span className="text-muted">(선택)</span>
        </label>
        <input
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          placeholder="○○초등학교"
          className="input-field px-4 text-sm"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="btn rounded-[10px] bg-teal px-6 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "저장 중..." : "시작하기"}
      </button>
    </div>
  );
}
