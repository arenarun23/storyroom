"use server";

import { recordLogin } from "@/lib/loginHistory";

export async function recordAdminLogin() {
  await recordLogin();
}
