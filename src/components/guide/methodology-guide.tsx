import type { MethodologyDict } from "@/lib/i18n/methodology-en";

export function MethodologyGuide({ dict, lang }: { dict: MethodologyDict; lang: "en" | "es" }) {
  const { sections } = dict;
  return (
    <main lang={lang} className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="font-display text-3xl">{dict.h1}</h1>
      <p className="mt-3 text-muted-foreground">{dict.intro}</p>
      <div className="mt-8 space-y-8">
        <section>
          <h2 className="font-display text-xl">{sections.nonpartisan.heading}</h2>
          <div className="mt-2 text-sm leading-relaxed">{sections.nonpartisan.body}</div>
        </section>

        <section>
          <h2 className="font-display text-xl">{sections.dataSources.heading}</h2>
          <div className="mt-2 text-sm leading-relaxed">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>{sections.dataSources.votingLogistics.label}</strong>
                {sections.dataSources.votingLogistics.before}{" "}
                <a href="https://myvote.wi.gov" className="underline" rel="noopener noreferrer" target="_blank">
                  {sections.dataSources.votingLogistics.linkText}
                </a>
                {sections.dataSources.votingLogistics.after}
              </li>
              <li>
                <strong>{sections.dataSources.racesCandidates.label}</strong>
                {sections.dataSources.racesCandidates.body}
              </li>
              <li>
                <strong>{sections.dataSources.campaignFinance.label}</strong>
                {sections.dataSources.campaignFinance.body}
              </li>
              <li>
                <strong>{sections.dataSources.politicalAds.label}</strong>
                {sections.dataSources.politicalAds.body}
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl">{sections.publishing.heading}</h2>
          <div className="mt-2 text-sm leading-relaxed">
            {sections.publishing.before}
            <em>{sections.publishing.emText}</em>
            {sections.publishing.after}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl">{sections.qualityChecks.heading}</h2>
          <div className="mt-2 text-sm leading-relaxed">{sections.qualityChecks.body}</div>
        </section>

        <section>
          <h2 className="font-display text-xl">{sections.corrections.heading}</h2>
          <div className="mt-2 text-sm leading-relaxed">
            {sections.corrections.p1Before}
            <a href="/feedback" className="underline">
              {sections.corrections.reportLinkText}
            </a>
            {sections.corrections.p1After}
            <br />
            <br />
            <strong>{sections.corrections.whatHappensLabel}</strong>
            {sections.corrections.whatHappensBody}
            <br />
            <br />
            <strong>{sections.corrections.whyMattersLabel}</strong>
            {sections.corrections.whyMattersBody}
            <br />
            <br />
            {sections.corrections.p2Before}
            <a
              href="https://github.com/tmoody1973/badgerbrief/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {sections.corrections.issueLinkText}
            </a>
            {sections.corrections.p2After}
          </div>
        </section>
      </div>
    </main>
  );
}
