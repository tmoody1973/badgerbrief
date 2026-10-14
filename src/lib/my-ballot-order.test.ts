// @vitest-environment node
import { join } from "node:path";
import { expect, test } from "vitest";
import { raceIdForContest } from "../../scripts/lib/wec-general.mjs";
import { readWecWorkbook } from "../../scripts/lib/wec-legislative.mjs";
import { contestPosition } from "./my-ballot";

const STATE_FILE = join(process.cwd(), "docs/evidence/2026-10-12-wec-general/All-Contests-and-Candidates_November-3-2026.xlsx");

test("the order this page uses is the order in the state's file", () => {
  const rows: Record<string, string>[] = readWecWorkbook(STATE_FILE);
  const stated = new Map<string, number>();
  for (const row of rows) {
    const raceId: string | null = raceIdForContest(row["Contest"] ?? "");
    if (raceId) stated.set(raceId, Number(row["Contest Ballot Position"]));
  }

  // Governor, Attorney General, Secretary of State, Treasurer, 8 U.S. House
  // seats, 17 State Senate seats, 99 Assembly seats.
  expect(stated.size).toBe(128);
  for (const [raceId, position] of stated) expect([raceId, contestPosition(raceId)]).toEqual([raceId, position]);
});
