/**
 * The state documents saved under docs/evidence, with the SHA-256 of the bytes
 * the Wisconsin Elections Commission served. Each was confirmed against a
 * fresh download on 2026-10-13.
 *
 * Opening a spreadsheet in an app and saving it keeps every cell and changes
 * every byte. The build and the tests refuse a document that no longer matches
 * its fingerprint, so a file is never read as "the state's" after it stops
 * being the state's. Restore one with `git checkout -- <path>`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const STATE_CANDIDATES_XLSX =
  "docs/evidence/2026-10-12-wec-general/All-Contests-and-Candidates_November-3-2026.xlsx";
export const REFERENDUM_NOTICE_PDF =
  "docs/evidence/2026-10-13-wec-referenda/Type-C-Notice-of-Referendum-2026-11-03.pdf";
/** The notice's text, extracted from the PDF with `pdftotext <pdf> <txt>`. */
export const REFERENDUM_NOTICE_TXT =
  "docs/evidence/2026-10-13-wec-referenda/Type-C-Notice-of-Referendum-2026-11-03.txt";
export const REFERENDUM_LISTING_XLSX =
  "docs/evidence/2026-10-13-wec-referenda/Referendum-Listing-10.6.26.xlsx";

export const EVIDENCE = [
  {
    path: STATE_CANDIDATES_XLSX,
    sha256: "f26aa3fffacaa5ea80fd9fc53e99f74a4ebba10fe4e96c0c3b96e89870ee213e",
    from: "https://elections.wi.gov/media/41846/download",
  },
  {
    path: REFERENDUM_NOTICE_PDF,
    sha256: "7df28a76dc83030c18019adae19c06482e4dcc2ce465e22fbe9d969168158781",
    from: "https://elections.wi.gov/sites/default/files/documents/Type%20C%20Notice%20for%20Ref%20for%20November%202026%20General%20Election_Final.pdf",
  },
  {
    path: REFERENDUM_NOTICE_TXT,
    sha256: "2909e2042f1dde983dc1ec64d56d11895a108879a2a0671da5d5494b7a1704aa",
    from: "pdftotext of the notice PDF above",
  },
  {
    path: REFERENDUM_LISTING_XLSX,
    sha256: "b8f9d900154aa449feae6a381f9c5f55b790fd67a6390c064fe3a13d1ced3efe",
    from: "https://elections.wi.gov/media/41851/download",
  },
];

export const fingerprint = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const expectedFingerprint = (path) => EVIDENCE.find((e) => e.path === path)?.sha256;

/** The documents whose bytes on disk are not the bytes the state served. */
export const alteredEvidence = (paths = EVIDENCE.map((e) => e.path), read = readFileSync) =>
  paths.filter((path) => fingerprint(read(path)) !== expectedFingerprint(path));
