export type ContributeKind = "suggest_candidate" | "suggest_source" | "data_gap" | "volunteer";

export const CONTRIBUTE_KINDS: { kind: ContributeKind; label: string; needs: ("source" | "contact")[] }[] = [
  { kind: "suggest_source", label: "Suggest a source", needs: ["source"] },
  { kind: "suggest_candidate", label: "Suggest a candidate we're missing", needs: [] },
  { kind: "data_gap", label: "Flag a gap in the guide", needs: [] },
  { kind: "volunteer", label: "Volunteer / get involved", needs: ["contact"] },
];

const VALID = new Set(CONTRIBUTE_KINDS.map((k) => k.kind));

export function parseContributeKind(raw: string | null): ContributeKind {
  return raw && VALID.has(raw as ContributeKind) ? (raw as ContributeKind) : "suggest_source";
}
