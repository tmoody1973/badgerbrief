import { describe, expect, test } from "vitest";
import type { UIMessage } from "@convex-dev/agent/react";
import { answerStamp, awaitingAnswer, farFromLatest } from "./chat-state";

const msg = (role: "user" | "assistant", text = "x") => ({ role, text, parts: [] }) as unknown as UIMessage;

describe("awaitingAnswer", () => {
  test("waits from the moment the voter sends, before the server has the question", () => {
    expect(awaitingAnswer([], "When is the deadline?")).toBe(true);
  });

  test("waits while the newest message is the voter's own question", () => {
    expect(awaitingAnswer([msg("assistant"), msg("user")], null)).toBe(true);
  });

  test("stops waiting once an answer follows the question", () => {
    expect(awaitingAnswer([msg("user"), msg("assistant")], null)).toBe(false);
    expect(awaitingAnswer([], null)).toBe(false);
  });
});

describe("answerStamp", () => {
  test("dates an answer in Wisconsin time, month and day", () => {
    // 2026-10-15 03:30 UTC is still the evening of Oct 14 in Wisconsin.
    expect(answerStamp(Date.UTC(2026, 9, 15, 3, 30))).toBe("Oct 14");
  });
});

describe("farFromLatest", () => {
  test("offers the jump to the latest message only when the voter has scrolled well above it", () => {
    expect(farFromLatest({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 })).toBe(true);
    expect(farFromLatest({ scrollTop: 1350, clientHeight: 600, scrollHeight: 2000 })).toBe(false);
  });
});
