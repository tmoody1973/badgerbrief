import type { Metadata } from "next";
import { MethodologyGuide } from "@/components/guide/methodology-guide";
import { methodologyEs } from "@/lib/i18n/methodology-es";
import { hreflangFor } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: methodologyEs.meta.title,
  description: methodologyEs.meta.description,
  alternates: {
    canonical: "/es/methodology",
    languages: hreflangFor("/methodology"),
  },
};

export default function MethodologyEsPage() {
  return <MethodologyGuide dict={methodologyEs} lang="es" />;
}
