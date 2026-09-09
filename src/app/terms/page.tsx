import type { Metadata } from "next";
import LegalDocView from "@/components/LegalDocView";
import { TERMS } from "@/lib/legal";

export const metadata: Metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:px-10">
      <LegalDocView doc={TERMS} />
    </div>
  );
}
