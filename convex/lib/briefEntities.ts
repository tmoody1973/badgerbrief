/**
 * MOO-313 code evaluator: collect every entity ID a parsed brief references,
 * so composeAttempt can verify each one exists in published tables before the
 * brief saves as ready.
 */

export interface EntityRefs {
  raceIds: string[];
  candidateSlugs: string[];
  issueSlugs: string[];
}

type ElementNodeLike = {
  type: string;
  typeName: string;
  props: Record<string, unknown>;
};

function isElementNode(value: unknown): value is ElementNodeLike {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "element" &&
    typeof (value as { typeName?: unknown }).typeName === "string" &&
    typeof (value as { props?: unknown }).props === "object"
  );
}

function addString(target: Set<string>, value: unknown): void {
  if (typeof value === "string" && value.length > 0) target.add(value);
}

/** Walk the OpenUI parse tree and collect raceIds / candidateSlugs / issueSlugs. */
export function collectEntityRefs(root: unknown): EntityRefs {
  const raceIds = new Set<string>();
  const candidateSlugs = new Set<string>();
  const issueSlugs = new Set<string>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isElementNode(value)) return;
    const { typeName, props } = value;
    switch (typeName) {
      case "RaceCard":
        addString(raceIds, props.raceId);
        break;
      case "CandidateCompareCard":
        addString(raceIds, props.raceId);
        if (Array.isArray(props.candidateSlugs)) {
          for (const slug of props.candidateSlugs) addString(candidateSlugs, slug);
        }
        break;
      case "IssueStanceCard":
        addString(candidateSlugs, props.candidateSlug);
        addString(issueSlugs, props.issueSlug);
        break;
      case "QuoteCard":
      case "FinanceSnapshot":
        addString(candidateSlugs, props.candidateSlug);
        break;
    }
    for (const propValue of Object.values(props)) visit(propValue);
  };

  visit(root);
  return {
    raceIds: [...raceIds],
    candidateSlugs: [...candidateSlugs],
    issueSlugs: [...issueSlugs],
  };
}
