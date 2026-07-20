import type { Metadata } from "next";
import { AdsAnalytics } from "@/components/guide/ads-analytics";
import { AdsBrowser } from "@/components/guide/ads-browser";
import { listAds } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Ad Tracker",
  description:
    "Who is paying to reach Wisconsin voters — political ad spend from the Meta Ad Library, sponsor by sponsor.",
};

export default async function AdsPage() {
  const ads = await listAds();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Wisconsin 2026
      </p>
      <h1 className="font-display mt-2 text-4xl leading-none sm:text-5xl">
        Who&apos;s paying to reach you?
      </h1>
      <p className="mt-4 max-w-2xl text-lg">
        Every political ad we&apos;ve tracked running to Wisconsin voters — the
        sponsor, who paid for it, and how much they spent. Spend and impressions
        are the ranges Meta discloses.
      </p>

      <section className="mt-8 border-2 border-border bg-warning p-4 text-sm text-foreground shadow-[var(--shadow-brutal)]">
        <p>
          <strong>How to read this.</strong> These sponsors are pulled straight
          from the Meta Ad Library and are <em>not yet</em> confirmed as any
          candidate&apos;s official page — attribution to a candidate only
          happens after a human verifies the source. So treat the sponsor name
          as reported by Meta, not as our endorsement of who it really backs.
        </p>
      </section>

      {ads.length > 0 && (
        <div className="mt-10">
          <AdsAnalytics ads={ads} />
        </div>
      )}

      <hr className="mt-10 border-t-2 border-dashed border-border" />
      <h2 className="font-display mt-8 text-2xl">Browse every ad</h2>

      <div className="mt-4">
        {ads.length > 0 ? (
          <AdsBrowser ads={ads} />
        ) : (
          <p className="border-2 border-dashed border-border p-6 text-center text-muted-foreground">
            No ads tracked yet. Check back soon.
          </p>
        )}
      </div>

      <p className="mt-10 border-t-2 border-dashed border-border pt-4 font-mono text-xs text-muted-foreground">
        Source: Meta Ad Library (political &amp; issue ads, US). Updated daily.
      </p>
    </main>
  );
}
