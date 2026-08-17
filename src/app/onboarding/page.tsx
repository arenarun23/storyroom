import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "@/app/onboarding/OnboardingForm";

// 최초 로그인 후 필수 정보(성명·소속시도·연락처) 입력, 소속학교는 선택
export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("real_name, region, phone, school_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="font-title text-xl font-bold text-ink">추가 정보 입력</h1>
          <p className="text-sm text-muted">
            선생님을 오프라인 행사에 모시기 위해서 좀 더 정확한 정보를 알기 위해서입니다.
          </p>
        </div>
        <OnboardingForm initial={profile ?? null} />
      </div>
    </div>
  );
}
