import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How we handle coverage",
  description:
    "How BadgerBrief tracks and publishes Wisconsin election coverage: what we cover, how outlet transparency is verified, the difference between the news hub and candidate pages, and how to report errors.",
  alternates: { canonical: "/news/about" },
};

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "What we cover: Wisconsin elections only",
    body: (
      <>
        BadgerBrief tracks coverage of Wisconsin&apos;s 2026 elections—races,
        candidates, voting logistics, and political advertising. We do not
        aggregate general news, opinion, or coverage outside Wisconsin or
        elections. If it&apos;s not directly about voting or a 2026 race,
        it&apos;s not here.
      </>
    ),
  },
  {
    heading: "We link out. We never rate or summarize.",
    body: (
      <>
        Every piece of coverage on BadgerBrief is someone else&apos;s work. We
        don&apos;t rewrite it, editorialize it, or inject our judgment about
        quality or bias. When an article appears here, you&apos;re seeing a
        headline, outlet name, and a link to the original. Read it yourself and
        form your own conclusion.
      </>
    ),
  },
  {
    heading: "Where outlet transparency comes from",
    body: (
      <>
        Next to each news outlet you&apos;ll see one of eight type
        labels—nonprofit, public media, daily paper, wire service, trade press,
        broadcast TV, national, or other—plus, when we have it, a short note on
        who owns the outlet and how it&apos;s funded. That information is drawn
        from the outlet&apos;s own about/ownership pages and public reference
        sources, and a person reviews it before it appears on BadgerBrief. Each
        profile links to the page we drew it from, so you can check us. Until
        that review happens, the outlet shows as &ldquo;profile
        pending&rdquo;—we&apos;d rather show you nothing than guess.
      </>
    ),
  },
  {
    heading: "We don't label political bias—in v1",
    body: (
      <>
        BadgerBrief aggregates source transparency, not bias labels. We know
        which outlets are nonprofit, public, or commercial—that&apos;s in the
        public record and verifiable. But assigning a left-right bias label
        requires subjective judgment, and we&apos;re not doing that yet. If you
        want to evaluate an outlet&apos;s politics yourself, the transparency
        labels give you the start.
      </>
    ),
  },
  {
    heading: "Two ways coverage appears: hub vs. candidate pages",
    body: (
      <>
        <strong>On the /news hub:</strong> New coverage matching our scope
        auto-publishes as links. Every matching article appears the same day
        it&apos;s found.
        <br />
        <br />
        <strong>On a candidate or race page:</strong> Coverage only appears in
        the &ldquo;In the news&rdquo; section after an editor has reviewed it
        and chosen to include it. This tier is curated; the hub is automatic.
      </>
    ),
  },
  {
    heading: "See something wrong? Report it.",
    body: (
      <>
        If a headline is wrong, an outlet label is inaccurate, or something
        doesn&apos;t belong, email{" "}
        <a href="mailto:tarik@radiomilwaukee.org" className="underline">
          tarik@radiomilwaukee.org
        </a>{" "}
        with a link to the article and what&apos;s incorrect. We&apos;ll review
        it and correct it.
      </>
    ),
  },
];

export default function NewsAboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="font-display text-3xl">How we handle coverage</h1>
      <p className="mt-3 text-muted-foreground">
        BadgerBrief aggregates Wisconsin election coverage from public news
        outlets. This page explains what we track, how we verify outlet
        information, and how editorial curation works.
      </p>
      <div className="mt-8 space-y-8">
        {SECTIONS.map(({ heading, body }) => (
          <section key={heading}>
            <h2 className="font-display text-xl">{heading}</h2>
            <div className="mt-2 text-sm leading-relaxed">{body}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
