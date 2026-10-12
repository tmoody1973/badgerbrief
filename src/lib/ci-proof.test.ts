import { expect, test } from "vitest";

test("CI proof: this test fails on purpose and is removed in the next commit", () => {
  expect(1).toBe(2);
});
