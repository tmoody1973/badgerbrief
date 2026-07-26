"use client";

import { useEffect } from "react";

/**
 * Ko-fi floating "Support me" button. Loaded client-side only — the widget
 * script writes directly to the DOM — mirroring the PostHog client-provider
 * pattern (no next/script). Guarded so the script is injected once.
 */
export function KofiWidget() {
  useEffect(() => {
    if (document.getElementById("kofi-overlay-script")) return;
    const s = document.createElement("script");
    s.id = "kofi-overlay-script";
    s.src = "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js";
    s.async = true;
    s.onload = () => {
      const w = window as unknown as {
        kofiWidgetOverlay?: { draw: (user: string, opts: Record<string, string>) => void };
      };
      w.kofiWidgetOverlay?.draw("tarikmoody", {
        type: "floating-chat",
        "floating-chat.donateButton.text": "Support me",
        "floating-chat.donateButton.background-color": "#d9534f",
        "floating-chat.donateButton.text-color": "#fff",
      });
    };
    document.body.appendChild(s);
  }, []);

  return null;
}
