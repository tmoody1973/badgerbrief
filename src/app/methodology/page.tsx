import type { Metadata } from "next";
import { MethodologyGuide } from "@/components/guide/methodology-guide";
import { methodologyEn } from "@/lib/i18n/methodology-en";
import { hreflangFor } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: methodologyEn.meta.title,
  description: methodologyEn.meta.description,
  alternates: {
    canonical: "/methodology",
    languages: hreflangFor("/methodology"),
  },
};

export default function MethodologyPage() {
  return <MethodologyGuide dict={methodologyEn} lang="en" />;
}
