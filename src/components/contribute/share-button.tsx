"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

const buttonClass =
  "press border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)]";
const linkClass = "text-sm underline decoration-2 underline-offset-2";

type Surface = "race" | "candidate" | "compare" | "brief" | "match";
type Method = "web_share" | "copy" | "x" | "facebook" | "email" | "bluesky";

// Which decision surface is being shared, inferred from the URL path so callers
// don't have to pass it. Returns null for pages outside the ones we track.
function shareSurface(url: string): Surface | null {
  if (url.includes("/compare/")) return "compare";
  if (url.includes("/candidates/")) return "candidate";
  if (url.includes("/races/")) return "race";
  if (url.includes("/match")) return "match";
  if (url.includes("/brief")) return "brief";
  return null;
}

// Append UTM params so inbound clicks are attributable in GA4 (our own PostHog/
// GA4 events strip query strings; GA4 page_view still captures these first).
// The `url` prop is always absolute, so `new URL()` is safe.
function taggedUrl(url: string, method: Method): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "share");
    u.searchParams.set("utm_medium", method);
    u.searchParams.set("utm_campaign", "voter_guide");
    return u.toString();
  } catch {
    return url;
  }
}

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const surface = shareSurface(url);

  const trackShare = (method: Method) => {
    if (surface) track("share", { surface, method });
  };

  // Capability check happens after mount only — SSR has no `navigator`, and
  // checking here (not during render) keeps first paint stable across
  // server/client.
  useEffect(() => {
    // Mount-only capability probe: reading it during render would desync SSR
    // (no navigator) from client hydration. Effect is the correct place here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  async function handleShare() {
    try {
      trackShare("web_share");
      await navigator.share({ title, url: taggedUrl(url, "web_share") });
    } catch (err) {
      // The user cancelling the native share sheet throws AbortError — not
      // an error worth surfacing.
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(taggedUrl(url, "copy"));
      trackShare("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable — the intent links below still
      // work, so there's nothing else to do here.
    }
  }

  const encodedTitle = encodeURIComponent(title);
  const xUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(taggedUrl(url, "x"))}&text=${encodedTitle}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(taggedUrl(url, "facebook"))}`;
  const emailUrl = `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(taggedUrl(url, "email"))}`;
  const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${taggedUrl(url, "bluesky")}`)}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={handleCopy} className={buttonClass}>
        {copied ? "Copied!" : "Copy link"}
      </button>
      {hasNativeShare && (
        <button type="button" onClick={handleShare} className={buttonClass}>
          Share
        </button>
      )}
      <a
        href={xUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={() => trackShare("x")}
      >
        Share on X
      </a>
      <a
        href={facebookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={() => trackShare("facebook")}
      >
        Share on Facebook
      </a>
      <a
        href={blueskyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={() => trackShare("bluesky")}
      >
        Share on Bluesky
      </a>
      <a href={emailUrl} className={linkClass} onClick={() => trackShare("email")}>
        Email
      </a>
    </div>
  );
}
