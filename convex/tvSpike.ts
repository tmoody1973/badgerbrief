"use node";
import { internalAction } from "./_generated/server";

// Throwaway de-risk spike (MOO-318, Task 1): prove Browserbase-from-Convex can
// enumerate an FCC political-files folder and download an order PDF. Deleted
// once Task 5 (real sync) lands.
// playwright-core is imported dynamically inside the handler: its top-level
// import pulls the browser registry (require('../../../package.json')), which
// Convex's push-time analyze step can't evaluate. Dynamic import defers that to
// runtime, where the externalized package (convex.json node.externalPackages)
// resolves normally.
export const tvSpike = internalAction({
  args: {},
  handler: async () => {
    const { Browserbase } = await import("@browserbasehq/sdk");
    const { chromium } = await import("playwright-core");
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
    const session = await bb.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
    });
    const browser = await chromium.connectOverCDP(session.connectUrl);
    try {
      const ctx = browser.contexts()[0];
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: "downloads",
        eventsEnabled: true,
      });

      // FCC public-files is an SPA that never reaches networkidle (long-polling).
      // Load DOM, then wait for the doc-row anchors to render via XHR.
      const folderUrl =
        "https://publicfiles.fcc.gov/tv-profile/WISN-TV/political-files/2026/state/barnes-for-governor/b27dca30-a82d-1020-be71-f8f1e5aab4d4";
      await page.goto(folderUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

      // Wait (best-effort) for download links to appear.
      let docsAppeared = false;
      try {
        await page.waitForFunction(
          () =>
            Array.from(document.querySelectorAll("a")).some((a) =>
              /\/api\/manager\/download\//.test((a as HTMLAnchorElement).href),
            ),
          { timeout: 30000 },
        );
        docsAppeared = true;
      } catch {
        // fall through with diagnostics
      }

      const docs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a"))
          .map((a) => ({
            text: (a.textContent || "").replace(/\s+/g, " ").trim(),
            href: (a as HTMLAnchorElement).href,
          }))
          .filter((l) => /\/api\/manager\/download\//.test(l.href)),
      );

      // Diagnostics so we can SEE the page state if enumeration is empty.
      const title = await page.title();
      const bodyText = (
        await page.evaluate(() => document.body?.innerText || "")
      )
        .replace(/\s+/g, " ")
        .slice(0, 600);
      const shot = await page.screenshot({ type: "png" });
      const screenshotB64 = shot.toString("base64").slice(0, 40) + "...(truncated)";

      // Download one PDF via the alternate host, then retrieve bytes via
      // Browserbase's REST downloads endpoint (Browserbase persists downloads
      // server-side as a session ZIP; the CDP stream comes back empty).
      let zipBytes = 0;
      let zipMagic = "";
      let retrieveNote = "";
      const fileManagerId = docs[0]?.href.split("/").pop()!.replace(".pdf", "");
      if (fileManagerId) {
        try {
          await Promise.all([
            page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
            page
              .goto(`https://files.fcc.gov/download/${fileManagerId}.pdf`)
              .catch(() => null),
          ]);
          // Give Browserbase a moment to persist the file, then pull the zip.
          await page.waitForTimeout(3000);
          const res = await fetch(
            `https://api.browserbase.com/v1/sessions/${session.id}/downloads`,
            { headers: { "X-BB-API-Key": process.env.BROWSERBASE_API_KEY! } },
          );
          retrieveNote = `HTTP ${res.status}`;
          const buf = Buffer.from(await res.arrayBuffer());
          zipBytes = buf.length;
          zipMagic = buf.subarray(0, 2).toString("latin1"); // "PK" = zip
        } catch (e) {
          retrieveNote = `retrieve-failed: ${(e as Error).message}`;
        }
      }

      return {
        sessionId: session.id,
        url: page.url(),
        title,
        docsAppeared,
        docCount: docs.length,
        firstDoc: docs[0]?.text,
        fileManagerId,
        zipBytes,
        zipMagic,
        retrieveNote,
        bodyText,
        screenshotB64,
      };
    } finally {
      await browser.close();
    }
  },
});
