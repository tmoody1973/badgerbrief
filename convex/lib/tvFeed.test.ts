import { describe, expect, test } from "vitest";
import { parseStationFeed } from "./tvFeed";

/** Entries in the exact shape publicfiles.fcc.gov/tv-profile/{call}/rss served on 2026-10-15. */
const entry = (fileId: string, path: string, fileName: string) => `  <entry>
    <title>tv Entity 65680 uploaded a file in ${path}</title>
    <link href="https://publicfiles.fcc.gov/api/manager/download/00145a07-4500-cfe2-2224-88ad04b16321/${fileId}.pdf"/>
    <id>${fileId}</id>
    <updated>2026-10-14T23:59:59Z</updated>
    <content type="xhtml" xml:lang="en" xml:base="http://stations.fcc.gov/">
      <div xmlns="http://www.w3.org/1999/xhtml">
        <p><strong><a href="http://publicfiles.fcc.gov/tv-profile/WISN-TV">65680</a></strong> uploaded <strong>${fileName}</strong> in <strong>${path}</strong> on 10/14/2026 11:40 am.</p>
      </div>
    </content>
  </entry>`;

const feed = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">  <title>FCC Online Public Inspection File - Upload Documents</title>
${entry("b71701f5-479a-4974-abb0-6523806c6fe1", "Political Files/2026/Non-Candidate Issue Ads/Oracle", "Oracle 11.2 (936).pdf")}
${entry("a1111111-0000-0000-0000-000000000001", "Political Files/2026/Federal/US House/Steil for WI-01", "Steil 10.14.pdf")}
${entry("a1111111-0000-0000-0000-000000000002", "Political Files/2026/State/Donovan Assembly", "Donovan.pdf")}
${entry("a1111111-0000-0000-0000-000000000003", "Political Files/2026/Local/Mayor Smith", "Smith.pdf")}
${entry("a1111111-0000-0000-0000-000000000004", "Political Files/2026/Terms and Disclosures", "Terms.pdf")}
${entry("a1111111-0000-0000-0000-000000000005", "Political Files/2024/Non-Candidate Issue Ads/Old PAC", "Old.pdf")}
${entry("a1111111-0000-0000-0000-000000000006", "Political Files/2026/State/Governor/Tiffany &amp; Varnam", "Tiffany.pdf")}
</feed>`;

describe("parseStationFeed", () => {
  const docs = parseStationFeed(feed, { year: 2026, trackedSurnames: ["steil", "tiffany"] });

  test("keeps every issue ad and only tracked candidates' folders, for this year", () => {
    expect(docs.map((d) => d.fileManagerId)).toEqual([
      "b71701f5-479a-4974-abb0-6523806c6fe1",
      "a1111111-0000-0000-0000-000000000001",
      "a1111111-0000-0000-0000-000000000006",
    ]);
  });

  test("carries the file name, the FCC link and the category the old browser path used", () => {
    expect(docs[0]).toEqual({
      fileManagerId: "b71701f5-479a-4974-abb0-6523806c6fe1",
      name: "Oracle 11.2 (936).pdf",
      fccDocUrl:
        "https://publicfiles.fcc.gov/api/manager/download/00145a07-4500-cfe2-2224-88ad04b16321/b71701f5-479a-4974-abb0-6523806c6fe1.pdf",
      category: "non-candidate-issue-ads",
    });
    expect(docs[1].category).toBe("federal");
  });

  test("returns nothing for a page that is not a feed, rather than throwing", () => {
    expect(parseStationFeed("<html>Access Denied</html>", { year: 2026, trackedSurnames: [] })).toEqual([]);
  });
});
