"use client";

import { useEffect } from "react";

/** Pure, testable registration guard. */
export function registerSw(nav: Navigator, env: string) {
  if (env !== "production") return;
  if (!("serviceWorker" in nav)) return;
  nav.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Registration failure must never break the page — offline is an enhancement.
  });
}

export function SwRegister() {
  useEffect(() => {
    registerSw(navigator, process.env.NODE_ENV);
  }, []);
  return null;
}
