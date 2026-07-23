import { describe, expect, test } from "vitest";
import { formatTimestamp, isInterviewQuote, timestampSeconds } from "./interview-quote";

describe("isInterviewQuote", () => {
  const url = "https://wiseye.org/2026/07/22/campaign-2026-david-crowley-d-candidate-for-governor/?t=115";

  test("matches a WisconsinEye quote sourced to a wiseye.org program", () => {
    expect(isInterviewQuote({ outlet: "WisconsinEye", sourceUrl: url })).toBe(true);
  });

  test("does not match on outlet name alone", () => {
    // Guards the Q&A rendering: a row labelled WisconsinEye but sourced
    // elsewhere has no interviewer question to show.
    expect(isInterviewQuote({ outlet: "WisconsinEye", sourceUrl: "https://wpr.org/x" })).toBe(false);
    expect(isInterviewQuote({ outlet: "WisconsinEye" })).toBe(false);
  });

  test("does not match other outlets", () => {
    expect(isInterviewQuote({ outlet: "Wisconsin Public Radio", sourceUrl: url })).toBe(false);
  });
});

describe("timestampSeconds", () => {
  test("reads the ?t= anchor", () => {
    expect(timestampSeconds("https://wiseye.org/x/?t=1474")).toBe(1474);
    expect(timestampSeconds("https://wiseye.org/x/?foo=1&t=90")).toBe(90);
  });

  test("returns null when absent or malformed", () => {
    expect(timestampSeconds("https://wiseye.org/x/")).toBeNull();
    expect(timestampSeconds("https://wiseye.org/x/?t=abc")).toBeNull();
    expect(timestampSeconds(undefined)).toBeNull();
  });
});

describe("formatTimestamp", () => {
  test("formats as m:ss, padding seconds", () => {
    expect(formatTimestamp(1474)).toBe("24:34");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(0)).toBe("0:00");
  });

  test("shows hours only when present", () => {
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});
