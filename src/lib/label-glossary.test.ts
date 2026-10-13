import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LABEL_GLOSSARY,
  LABEL_GLOSSARY_KEY_DISTINCTION,
  LABEL_GLOSSARY_PATH,
} from "./label-glossary";

/**
 * The glossary the chat reads and the /ballot-basics page a reader is sent to
 * must not drift apart.
 *
 * The risk is specific: the chat cites /ballot-basics as where to check its
 * answer. If a term is removed from that page, or a new term is added to the
 * chat's glossary and never explained there, the citation points somewhere that
 * does not support the claim — which is worse than not citing at all.
 */
const PAGE = "src/app/ballot-basics/page.tsx";

describe("label glossary", () => {
  const page = readFileSync(PAGE, "utf8");

  it("has the four terms voters actually confuse", () => {
    expect(LABEL_GLOSSARY.map((t) => t.term)).toEqual([
      "Socialism",
      "Communism",
      "Democratic socialism",
      "Social democracy",
    ]);
  });

  it.each(LABEL_GLOSSARY.map((t) => t.term))(
    "%s is also explained on the page the chat cites",
    (term) => {
      expect(page.toLowerCase()).toContain(term.toLowerCase());
    },
  );

  it("keeps the one-party-vs-elections distinction, the point readers miss", () => {
    expect(LABEL_GLOSSARY_KEY_DISTINCTION).toMatch(/one-party/i);
    expect(LABEL_GLOSSARY_KEY_DISTINCTION).toMatch(/competitive elections/i);
    // The page must make the same comparison, not merely mention the words.
    expect(page).toMatch(/one-party systems[\s\S]{0,120}competitive elections/i);
  });

  it("cites democratic socialism to the people who use the label", () => {
    const ds = LABEL_GLOSSARY.find((t) => t.term === "Democratic socialism");
    expect(ds?.source?.url).toContain("dsausa.org");
    expect(page).toContain("dsausa.org");
  });

  it("points readers at a page that exists", () => {
    expect(LABEL_GLOSSARY_PATH).toBe("/ballot-basics");
    expect(() => readFileSync(PAGE, "utf8")).not.toThrow();
  });

  it("defines every term without leaving an empty definition", () => {
    for (const t of LABEL_GLOSSARY) {
      expect(t.definition.length).toBeGreaterThan(80);
    }
  });
});
