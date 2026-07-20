import type { Metadata } from "next";
import { BriefLoader } from "@/components/brief/loader";
import { PreferencesPanel } from "@/components/brief/preferences-panel";
import { BriefValueProp } from "@/components/brief/value-prop";

export const metadata: Metadata = {
  title: "Your primary brief",
  robots: { index: false }, // personal, Clerk-gated
};

export default function BriefPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <BriefValueProp />
      <PreferencesPanel />
      <BriefLoader />
    </main>
  );
}
