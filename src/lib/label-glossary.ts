/**
 * Political-label definitions, in one place so the chat and the site say the
 * same thing.
 *
 * These words are doing real work in the 2026 Democratic primary — Francesca
 * Hong is a DSA member and the debate's second question was about the DSA
 * platform — and they get used as description and as insult in roughly equal
 * measure. Until now the definitions existed only as prose inside
 * app/ballot-basics/page.tsx, so a voter who asked Voter Help "what is
 * democratic socialism" got the model's general knowledge instead of our
 * sourced copy. On a guide whose posture is that every claim links to its
 * source, answering that question unsourced is the wrong answer even when the
 * content happens to be right.
 *
 * The copy here is deliberately the same substance as the /ballot-basics
 * section, which was balanced carefully; label-glossary.test.ts asserts the
 * page still covers every term so the two cannot silently drift apart.
 */
export type LabelTerm = {
  term: string;
  definition: string;
  /** Where a reader can check it, published by the people who use the label. */
  source?: { name: string; url: string };
};

export const LABEL_GLOSSARY: LabelTerm[] = [
  {
    term: "Socialism",
    definition:
      "A broad umbrella for the idea that the public, rather than private owners, should own or control major parts of the economy. It spans a wide range: some versions work through democracy and elections, others through one-party control. On its own, “socialist” is a broad word that doesn't tell you which.",
  },
  {
    term: "Communism",
    definition:
      "In practice, the 20th-century communist states (such as the Soviet Union, China, Cuba, or North Korea) were run by a single ruling party that controlled both the government and the economy, without competitive, multiparty elections. Ownership was concentrated in the state.",
  },
  {
    term: "Democratic socialism",
    definition:
      "The “democratic” part is the point: it commits to democracy — free, competitive elections, civil liberties, and more than one party — while pushing for a larger public and worker role in the economy. It rejects the one-party model. Its aims can include public programs, labor rights, and forms of public or worker ownership. Because it works through elections, its candidates in the U.S. usually run inside the Democratic Party.",
    source: {
      name: "Democratic Socialists of America",
      url: "https://www.dsausa.org/about-us/what-is-democratic-socialism/",
    },
  },
  {
    term: "Social democracy",
    definition:
      "Easy to mix up with democratic socialism. Social democracy keeps a private, market economy but pairs it with a strong safety net and public services — the model often associated with countries like Denmark, Sweden, or Norway.",
  },
];

/**
 * The distinction readers most often get wrong, stated once. Kept separate from
 * the definitions because it is the comparison, not any single term.
 */
export const LABEL_GLOSSARY_KEY_DISTINCTION =
  "One clear difference between communism as it has actually been practiced and democratic socialism is who holds power: communist states have been one-party systems without competitive elections, while democratic socialists run in elections and support multiparty democracy. The two terms are not interchangeable.";

/** The stance the guide takes on labels generally, and does not depart from. */
export const LABEL_GLOSSARY_STANCE =
  "Heated labels get thrown in every direction and are often used loosely as attacks rather than descriptions. The answer does not change depending on which direction they fly: don't vote a label. Read what a candidate actually supports, linked to its source, on their page.";

/** Canonical page a reader should be sent to for the full explanation. */
export const LABEL_GLOSSARY_PATH = "/ballot-basics";
