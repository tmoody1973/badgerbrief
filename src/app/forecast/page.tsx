import type { Metadata } from "next";
import { ForecastExperience } from "@/components/forecast/forecast-experience";

export const metadata: Metadata = {
  title: "Forecast — Wisconsin Governor Democratic primary",
  description:
    "How the public polls read the 2026 Wisconsin Governor Democratic primary — aggregated, with the uncertainty shown. Educational, not a prediction.",
  alternates: { canonical: "/forecast" },
};

export default function ForecastPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
        Poll aggregation · uncertainty
      </p>
      <h1 className="font-display mt-2 text-4xl leading-tight">
        Reading the primary, honestly
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        The Democratic candidates for governor, read the way a forecaster reads a race — every
        public poll combined into one picture, with the uncertainty out loud. It never names a
        winner, because the honest answer depends on assumptions you can move yourself.
      </p>
      <ForecastExperience raceId="WI-GOV-2026" />
    </main>
  );
}
