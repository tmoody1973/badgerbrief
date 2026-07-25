import type { Metadata } from "next";
import { AboutGuide } from "@/components/guide/about-guide";
import { aboutEs } from "@/lib/i18n/about-es";
import { hreflangFor } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: aboutEs.meta.title,
  description: aboutEs.meta.description,
  alternates: {
    canonical: "/es/about",
    languages: hreflangFor("/about"),
  },
};

export default function AboutEsPage() {
  return <AboutGuide dict={aboutEs} lang="es" />;
}
