import { ConvexError } from "convex/values";

/**
 * What to tell a voter when starting a brief fails. A message the server sent
 * on purpose (a ConvexError carrying text, e.g. the BRIEF_DISABLED off switch)
 * is shown as written; anything else is a generic try-again.
 */
export function briefStartError(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return "Couldn't start your brief — try again.";
}
