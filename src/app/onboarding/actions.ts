"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REGIONS } from "@/lib/regions";
import type { ActionResult } from "@/lib/types";

interface OnboardingInput {
  realName: string;
  region: string;
  phone: string;
  schoolName: string;
}

// 최초 로그인 후 필수 정보 입력. real_name/region/phone/school_name은
// 보호 컬럼이 아니므로 본인이 직접 저장한다(RLS profiles_update로 이미 허용).
export async function completeOnboarding(input: OnboardingInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const realName = input.realName.trim();
  const phone = input.phone.trim();
  const schoolName = input.schoolName.trim();

  if (!realName) return { ok: false, message: "성명을 입력해 주세요." };
  if (!REGIONS.includes(input.region as (typeof REGIONS)[number])) {
    return { ok: false, message: "소속 시도를 선택해 주세요." };
  }
  if (phone.replace(/\D/g, "").length < 9) {
    return { ok: false, message: "연락처를 정확히 입력해 주세요." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      real_name: realName,
      region: input.region,
      phone,
      school_name: schoolName || null,
    })
    .eq("id", user.id);

  if (error) return { ok: false, message: "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" };

  revalidatePath("/me");
  return { ok: true };
}
