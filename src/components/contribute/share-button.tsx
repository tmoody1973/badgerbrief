"use client";

import { useEffect, useState } from "react";

const buttonClass =
  "press border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)]";
const linkClass = "text-sm underline decoration-2 underline-offset-2";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  // Capability check happens after mount only — SSR has no `navigator`, and
  // checking here (not during render) keeps first paint stable across
  // server/client.
  useEffect(() => {
    setHasNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  async function handleShare() {
    try {
      await navigator.share({ title, url });
    } catch (err) {
      // The user cancelling the native share sheet throws AbortError — not
      // an error worth surfacing.
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable — the X/Facebook links below
      // still work, so there's nothing else to do here.
    }
  }

  if (hasNativeShare) {
    return (
      <button type="button" onClick={handleShare} className={buttonClass}>
        Share
      </button>
    );
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={handleCopy} className={buttonClass}>
        {copied ? "Copied!" : "Copy link"}
      </button>
      <a
        href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Share on X
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Share on Facebook
      </a>
    </div>
  );
}
