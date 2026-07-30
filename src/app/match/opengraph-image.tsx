import { OG_SIZE, OG_CONTENT_TYPE, ogCard } from "@/lib/og-card";

// Share card for the issue-match tool. One card for the route — the personalized
// ?issues= state can't vary an og:image (crawlers ignore query strings), so this
// invites the recipient to run the tool themselves.
export const alt = "Find your Wisconsin 2026 candidates by issue — BadgerBrief";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "What matters to you?",
    title: "Find your candidates by issue",
    subtitle: "Pick the issues you care about — see where every candidate on your ballot stands.",
  });
}
