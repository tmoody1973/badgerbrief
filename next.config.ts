import type { NextConfig } from "next";
// The allowlist and its reasoning live with the code that also checks it.
import { remotePatterns } from "./src/lib/image-hosts";

const nextConfig: NextConfig = {
  images: { remotePatterns },
  // Tree-shake barrel imports from the two heaviest client dependencies. Clerk
  // and Convex load on every public page (the header sign-in and the ballot
  // finder need them), and their index re-exports otherwise pull far more into
  // the bundle than a page actually uses — the bulk of PageSpeed's
  // "reduce unused JavaScript" flag. This ships only the symbols each page
  // imports. Render-safe: it changes how modules are bundled, not what runs.
  experimental: {
    optimizePackageImports: ["@clerk/nextjs", "convex/react", "convex/react-clerk"],
  },
  /**
   * The Legislature used to be two chamber-wide races whose districts lived in
   * an opaque blob. They are now one race per district, and the old pair was
   * dropped from the homepage — which left two indexed URLs with no inbound
   * links, competing with the 116 real district pages for the same query.
   *
   * Permanent, not temporary: the split is not being reverted, and a 301 hands
   * the accumulated signal to the pages that replaced them instead of stranding
   * it. Redirecting home rather than 404ing keeps anything already indexed or
   * linked working, and the homepage carries the district browser.
   */
  async redirects() {
    // These chamber-wide races were superseded by one race per district. Send
    // their old URLs to the /races hub, which lists every district race — a
    // relevant destination Google treats as a real 301, rather than the
    // homepage, which reads as a soft-404 "redirect to unrelated page."
    return [
      { source: "/races/wi-state-senate-2026", destination: "/races", permanent: true },
      { source: "/races/wi-state-assembly-2026", destination: "/races", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
