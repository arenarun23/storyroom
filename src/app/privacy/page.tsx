import type { Metadata } from "next";
import LegalDocView from "@/components/LegalDocView";
import { PRIVACY } from "@/lib/legal";

export const metadata: Metadata = { title: "개인정보 수집·이용 동의" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:px-10">
      <LegalDocView doc={PRIVACY} />
    </div>
  );
}
