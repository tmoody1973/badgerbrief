// @vitest-environment node
import { ConvexError } from "convex/values";
import { expect, it } from "vitest";
import { briefStartError } from "./start-error";

it("shows the server's own message when it sends one (the off switch)", () => {
  expect(briefStartError(new ConvexError("New briefs are paused for now. The rest of the guide still works."))).toBe(
    "New briefs are paused for now. The rest of the guide still works.",
  );
});

it("falls back to try-again for anything else", () => {
  expect(briefStartError(new Error("[Request ID: abc] Server Error"))).toBe("Couldn't start your brief — try again.");
  expect(briefStartError(new ConvexError({ code: 1 }))).toBe("Couldn't start your brief — try again.");
});
