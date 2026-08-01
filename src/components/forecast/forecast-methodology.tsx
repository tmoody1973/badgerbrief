/**
 * "Is this legit?" — the research behind each signal on the forecast page.
 * Static/server-rendered (no interactivity) so it's SEO- and reader-friendly.
 * Every verdict links to real, checkable sources — on brand for a site whose
 * whole pitch is that every claim is one click from its source.
 */
import Link from "next/link";

type Verdict = "Well-validated" | "Moderately supported" | "Contested / weak";

const VERDICT_CHIP: Record<Verdict, string> = {
  "Well-validated": "border-success text-success",
  "Moderately supported": "border-warning text-warning",
  "Contested / weak": "border-border text-muted-foreground",
};

type Method = {
  name: string;
  verdict: Verdict;
  body: string;
  cites: { label: string; url: string }[];
};

const METHODS: Method[] = [
  {
    name: "Combining the polls",
    verdict: "Well-validated",
    body: "Averaging many polls — counting newer and larger ones more — is a recognized technique. The catch: averaging removes random noise but not systematic bias. Polls can all lean the same way by about 2 points, so the polls are the strongest signal here, not a certain one.",
    cites: [
      { label: "Jackman 2005, Pooling the Polls", url: "https://doi.org/10.1080/10361140500302472" },
      { label: "Shirani-Mehr et al. 2018, Bias & Variance in Election Polls", url: "https://doi.org/10.1080/01621459.2018.1448823" },
    ],
  },
  {
    name: "Turning a lead into a probability",
    verdict: "Well-validated",
    body: "Simulating the race thousands of times within the polling error is standard practice — it's exactly why a lead is not a lock. The error on the gap between two candidates is about double the margin of error you usually hear quoted.",
    cites: [
      { label: "Gelman et al. 2020, Information, Incentives & Goals in Election Forecasts", url: "https://sites.stat.columbia.edu/gelman/research/published/jdm200907b.pdf" },
      { label: "Pew 2016, Understanding the Margin of Error", url: "https://www.pewresearch.org/short-reads/2016/09/08/understanding-the-margin-of-error-in-election-polls/" },
    ],
  },
  {
    name: "Blending polls with other signals",
    verdict: "Moderately supported",
    body: "Mixing polls with non-poll “fundamentals” is a real forecasting tradition, but the accuracy gain is inconsistent. That's why the blend here is a teaching tool — you set the weights — and never prints a single number.",
    cites: [
      { label: "Abramowitz 2008, Time-for-Change", url: "https://doi.org/10.1017/S1049096508081249" },
      { label: "Heidemanns, Gelman & Morris 2020, The Economist model", url: "https://doi.org/10.1162/99608f92.fc62f1e1" },
    ],
  },
  {
    name: "Social reach / buzz",
    verdict: "Contested / weak",
    body: "The claim that social-media buzz predicts vote share has been debunked repeatedly. This is why the page says buzz ≠ votes — that's the research's actual finding, not a disclaimer we added.",
    cites: [
      { label: "Gayo-Avello 2012, No, You Cannot Predict Elections with Twitter", url: "https://doi.org/10.1109/MIC.2012.137" },
      { label: "Jungherr, Jürgens & Schoen 2012", url: "https://doi.org/10.1177/0894439311404119" },
    ],
  },
  {
    name: "Ad spend",
    verdict: "Contested / weak",
    body: "Campaign spending's persuasive effect is close to zero in rigorous experiments, and winners raise more because they're already winning. So ad spend is a revealed belief — where a campaign thinks the vote is — not a result.",
    cites: [
      { label: "Kalla & Broockman 2018, The Minimal Persuasive Effects of Campaign Contact", url: "https://doi.org/10.1017/S0003055417000363" },
      { label: "Feigenbaum & Shelton 2013, The Vicious Cycle", url: "https://doi.org/10.1561/100.00011094" },
    ],
  },
  {
    name: "News tone",
    verdict: "Contested / weak",
    body: "Coverage tone tracks the polls more than it moves them — it's largely a mirror of where a candidate already stands, not an independent predictor. So we show it, link every headline, and don't lean on it.",
    cites: [
      { label: "Wlezien 2024, News and Public Opinion: Which Comes First?", url: "https://doi.org/10.1086/726940" },
    ],
  },
  {
    name: "Who votes in an August primary",
    verdict: "Well-validated",
    body: "Primary electorates really are smaller and older than the general-election electorate. (The common claim that they're far more ideologically extreme is overstated.) That's why turnout is a slider, framed as illustrative.",
    cites: [
      { label: "Sides, Tausanovitch, Vavreck & Warshaw 2020, Representativeness of Primary Electorates", url: "https://doi.org/10.1017/S000712341700062X" },
    ],
  },
];

export function ForecastMethodology() {
  return (
    <section className="mx-auto mt-12 w-full max-w-3xl px-4">
      <div className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
          Is this legit?
        </p>
        <h2 className="font-display mt-2 text-2xl">What the research actually says</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page isn’t a black box. Here’s what election-forecasting research says about each
          signal — including where it’s weak. The short version: <b className="text-foreground">the
          polls are the strongest signal, not a certain one</b>, and the skepticism about buzz, ad
          spend, and news tone isn’t ours — it’s the academic consensus.
        </p>

        <div className="mt-5 flex flex-col divide-y divide-border">
          {METHODS.map((m) => (
            <div key={m.name} className="py-4 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-mono text-sm font-bold uppercase tracking-wide">{m.name}</h3>
                <span
                  className={`border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${VERDICT_CHIP[m.verdict]}`}
                >
                  {m.verdict}
                </span>
              </div>
              <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{m.body}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {m.cites.map((c) => (
                  <a
                    key={c.url}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline decoration-2 underline-offset-2"
                  >
                    {c.label} ↗
                  </a>
                ))}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 border-l-2 border-primary bg-muted/40 p-3 text-sm text-muted-foreground">
          <b className="text-foreground">The honest bottom line:</b> the “move the weights, watch the
          leader change” tool is a way to <i>think about</i> a race and its uncertainty — not a
          calibrated statistical model. It never names a winner on purpose. See the site’s{" "}
          <Link href="/methodology" className="underline decoration-2 underline-offset-2">
            full methodology
          </Link>{" "}
          for how the underlying data is sourced and checked.
        </p>
      </div>
    </section>
  );
}
