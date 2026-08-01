import Link from "next/link";
import type { AboutDict } from "@/lib/i18n/about-en";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";

const meta = "font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-2 border-border bg-card p-3">
      <p className={meta}>{label}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

export function AboutGuide({ dict, lang }: { dict: AboutDict; lang: "en" | "es" }) {
  const homePath = lang === "es" ? "/es" : "/";
  const aboutPath = lang === "es" ? "/es/about" : "/about";
  const methodologyHref = lang === "es" ? "/es/methodology" : "/methodology";

  return (
    <main lang={lang} className="mx-auto w-full max-w-3xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: dict.crumbs.home, path: homePath },
            { name: dict.crumbs.about, path: aboutPath },
          ]),
        ]}
      />

      <h1 className="font-display text-3xl">{dict.h1}</h1>

      <p className="mt-4 max-w-[60ch] text-lg">{dict.intro}</p>

      <p className="mt-4">
        <Link
          href="/feedback"
          className="text-sm underline decoration-2 underline-offset-2"
        >
          {dict.reportMistake}
        </Link>
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl">{dict.independent.heading}</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label={dict.independent.fundingLabel}>{dict.independent.fundingBody}</Fact>
          <Fact label={dict.independent.affiliationLabel}>{dict.independent.affiliationBody}</Fact>
          <Fact label={dict.independent.endorsementsLabel}>{dict.independent.endorsementsBody}</Fact>
        </div>
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">{dict.independent.footer}</p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">{dict.facts.heading}</h2>
        <p className="mt-2 max-w-[60ch]">{dict.facts.p1}</p>
        <p className="mt-3 max-w-[60ch]">
          {dict.facts.p2Before}{" "}
          <Link href={methodologyHref} className="underline decoration-2 underline-offset-2">
            {dict.facts.p2LinkText}
          </Link>{" "}
          {dict.facts.p2After}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">{dict.who.heading}</h2>
        <p className="mt-2 max-w-[60ch]">
          {dict.who.p1Before}{" "}
          <strong>Tarik Moody</strong>
          {dict.who.p1After}
        </p>
        <p className="mt-3 max-w-[60ch]">
          <strong>{dict.who.disclosureLabel}</strong>
          {dict.who.disclosureBody}
        </p>
        <p className="mt-3 max-w-[60ch]">{dict.who.p3}</p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">{dict.openSource.heading}</h2>
        <p className="mt-2 max-w-[60ch]">{dict.openSource.body1}</p>
        <p className="mt-3 max-w-[60ch]">{dict.openSource.body2}</p>
        <p className="mt-3">
          <a
            href={dict.openSource.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-2 underline-offset-2"
          >
            {dict.openSource.repoCta}
          </a>
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">{dict.wrong.heading}</h2>
        <p className="mt-2 max-w-[60ch]">{dict.wrong.p1}</p>
        <p className="mt-4">
          <Link
            href="/feedback"
            className="press inline-block border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)]"
          >
            {dict.wrong.reportCta}
          </Link>
        </p>
      </section>
    </main>
  );
}
