import { z } from "zod";

/** MOO-312 canonical M1 issue vocabulary — keep in sync with spec §2. */
export const ISSUE_SLUGS = [
  "abortion",
  "economy-jobs",
  "education",
  "elections-democracy",
  "environment-energy",
  "healthcare",
  "housing",
  "immigration",
  "public-safety",
  "taxes-budget",
] as const;

export const extractionSchema = z.object({
  positions: z.array(
    z.object({
      issueSlug: z.enum(ISSUE_SLUGS),
      stance: z.enum(["support", "oppose", "mixed", "evolving", "unclear"]),
      summary: z.string().min(10).describe("1-2 neutral sentences"),
      confidence: z.number().min(0).max(1),
      evidenceExcerpt: z
        .string()
        .min(10)
        .describe("verbatim excerpt from the page supporting the stance"),
    }),
  ),
  quotes: z.array(
    z.object({
      text: z.string().min(10).describe("verbatim quote from the page"),
      context: z.string(),
      date: z.string().optional().describe("ISO date if stated on the page"),
    }),
  ),
});

export type Extraction = z.infer<typeof extractionSchema>;

export function buildExtractionPrompt(
  candidateName: string,
  siteUrl: string,
  markdown: string,
): string {
  return [
    `You extract issue positions and quote candidates for a NON-PARTISAN voter guide.`,
    `Candidate: ${candidateName}. Source: ${siteUrl} (their own campaign site).`,
    `Rules:`,
    `- Only use what the page actually says. Every evidenceExcerpt and quote text must be verbatim from the page — never paraphrase into a quote, never invent.`,
    `- Positions must map to exactly one of these issue slugs: ${ISSUE_SLUGS.join(", ")}. Skip topics that fit none.`,
    `- summary is 1-2 neutral, descriptive sentences; no loaded language, no endorsement.`,
    `- stance reflects the candidate's own stated position (support/oppose/mixed/evolving/unclear).`,
    `- confidence reflects how explicitly the page states the position (explicit pledge ≈ 0.9, inference from emphasis ≈ 0.4).`,
    `- Return empty arrays when the page has nothing extractable.`,
    ``,
    `PAGE CONTENT (markdown):`,
    markdown.slice(0, 60_000),
  ].join("\n");
}
