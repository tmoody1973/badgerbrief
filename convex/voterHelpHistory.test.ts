import { describe, expect, test } from "vitest";
import { RECENT_MESSAGES } from "./voterHelp";

describe("Voter Help conversation history", () => {
  test("sends the model only the last few messages, so old answers cannot stand in for a fresh lookup", () => {
    // 2026-10-14: with the library default of 100, a primary-season thread
    // answered the November registration deadline with July's date.
    expect(RECENT_MESSAGES).toBeGreaterThanOrEqual(2);
    expect(RECENT_MESSAGES).toBeLessThanOrEqual(10);
  });
});
