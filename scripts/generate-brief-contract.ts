/**
 * Regenerates convex/lib/briefContract.json — the server-usable form of the
 * MOO-305 registry. Convex can't bundle src/lib/brief (React + "@/" aliases),
 * so the Brief Agent consumes this artifact instead.
 * Run: pnpm generate:brief-contract  (guarded by src/lib/brief/contract.test.ts)
 */
import { writeFileSync } from "node:fs";
import { briefPrompt } from "../src/lib/brief/prompt";
import { briefLibrary } from "../src/lib/brief/library";

const artifact = {
  prompt: briefPrompt,
  schema: briefLibrary.toJSONSchema(),
};
writeFileSync(
  new URL("../convex/lib/briefContract.json", import.meta.url),
  JSON.stringify(artifact, null, 2) + "\n",
);
console.error("wrote convex/lib/briefContract.json");
