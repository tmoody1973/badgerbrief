import { describe, expect, test } from "vitest";
import { briefPrompt } from "./prompt";
import { briefLibrary } from "./library";
import artifact from "../../../convex/lib/briefContract.json";

describe("brief contract artifact (convex/lib/briefContract.json)", () => {
  test("prompt matches briefPrompt — regenerate with `pnpm generate:brief-contract`", () => {
    expect(artifact.prompt).toBe(briefPrompt);
  });
  test("schema matches briefLibrary.toJSONSchema()", () => {
    expect(artifact.schema).toEqual(JSON.parse(JSON.stringify(briefLibrary.toJSONSchema())));
  });
  test("artifact carries no fabrication rule", () => {
    expect(artifact.prompt).not.toMatch(/generate realistic\/plausible data/);
  });
});
