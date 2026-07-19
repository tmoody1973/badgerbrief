import { createParser, type LibraryJSONSchema } from "@openuidev/lang-core";

/** End-of-generation gate: a brief saves as ready only when this returns ok.
 * On ok, `root` is the parsed ElementNode tree (for entity-ref checks). */
export function validateBriefSource(
  source: string,
  schema: unknown,
): { ok: true; root: unknown } | { ok: false; summary: string } {
  const result = createParser(schema as LibraryJSONSchema).parse(source); // matches src/lib/brief/library.test.ts's call shape
  const errors = result.meta.errors ?? [];
  const unresolved = result.meta.unresolved ?? [];
  if (errors.length === 0 && unresolved.length === 0) return { ok: true, root: result.root };
  const parts = [
    ...errors.map((e: unknown) => (typeof e === "string" ? e : JSON.stringify(e))),
    ...unresolved.map((name: string) => `unresolved reference: "${name}"`),
  ];
  return { ok: false, summary: parts.slice(0, 10).join("\n") };
}
