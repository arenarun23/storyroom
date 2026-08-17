"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/app/onboarding/actions";
import { REGIONS } from "@/lib/regions";

interface ProfileInfoEditorProps {
  realName: string | null;
  region: string | null;
  phone: string | null;
  schoolName: string | null;
}

// 온보딩 때 입력한 성명·소속시도·연락처·소속학교를 내 정보 페이지에서
// 언제든 다시 열람·수정할 수 있게 한다. 저장 로직은 온보딩과 동일하다.
export default function ProfileInfoEditor({
  realName: initialRealName,
  region: initialRegion,
  phone: initialPhone,
  schoolName: initialSchoolName,
}: ProfileInfoEditorProps) {
  const [editing, setEditing] = useState(false);
  const [realName, setRealName] = useState(initialRealName ?? "");
  const [region, setRegion] = useState(initialRegion ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [schoolName, setSchoolName] = useState(initialSchoolName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    setRealName(initialRealName ?? "");
    setRegion(initialRegion ?? "");
    setPhone(initialPhone ?? "");
    setSchoolName(initialSchoolName ?? "");
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding({ realName, region, phone, schoolName });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="card flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-title text-lg font-bold text-ink">추가 정보</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="chip border border-line px-4 text-xs font-semibold text-ink"
          >
            수정
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">
              성명 <span className="text-danger">*</span>
            </label>
            <input
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              className="input-field px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">
              소속 시도 <span className="text-danger">*</span>
            </label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="input-field px-2 text-sm">
              <option value="">선택해 주세요</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">
              연락처 <span className="text-danger">*</span>
            </label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field px-3 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">소속 학교 (선택)</label>
            <input
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="input-field px-3 text-sm"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleSave}
              className="chip bg-teal px-4 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="chip border border-line px-4 text-xs font-semibold text-muted"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">성명</dt>
            <dd className="text-ink">{initialRealName ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">소속 시도</dt>
            <dd className="text-ink">{initialRegion ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">연락처</dt>
            <dd className="text-ink">{initialPhone ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">소속 학교</dt>
            <dd className="text-ink">{initialSchoolName ?? "-"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
