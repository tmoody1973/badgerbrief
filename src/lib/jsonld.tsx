import { SITE_NAME, SITE_URL } from "./site";

/**
 * JSON-LD builders. Combined per page via @graph (context declared once).
 * Data comes from our own seeded/published tables (trusted), rendered into
 * a script tag; JSON.stringify escaping is sufficient here.
 */

type JsonLdNode = Record<string, unknown>;

export function organizationNode(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#org`,
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "Non-partisan, source-linked Wisconsin voter guide and election intelligence platform.",
  };
}

export function electionEventNode(e: {
  primaryDate: string;
  generalDate: string;
}): JsonLdNode {
  return {
    "@type": "Event",
    "@id": `${SITE_URL}/#election-2026-primary`,
    name: "Wisconsin Partisan Primary 2026",
    startDate: "2026-08-11",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "State", name: "Wisconsin" },
    description: `Wisconsin partisan primary (${e.primaryDate}); general election ${e.generalDate}.`,
    organizer: { "@id": `${SITE_URL}/#org` },
  };
}

export function personNode(c: {
  name: string;
  slug: string;
  currentOccupation?: string;
  background?: string;
  photoUrl?: string;
  sources: { name: string; url: string }[];
}): JsonLdNode {
  const campaignSite = c.sources.find((s) =>
    s.name.toLowerCase().includes("campaign"),
  );
  return {
    "@type": "Person",
    "@id": `${SITE_URL}/candidates/${c.slug}#person`,
    name: c.name,
    url: `${SITE_URL}/candidates/${c.slug}`,
    ...(c.currentOccupation ? { jobTitle: c.currentOccupation } : {}),
    ...(c.background ? { description: c.background } : {}),
    ...(c.photoUrl ? { image: c.photoUrl } : {}),
    ...(campaignSite ? { sameAs: [campaignSite.url] } : {}),
  };
}

export function breadcrumbNode(
  crumbs: { name: string; path: string }[],
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.path}`,
    })),
  };
}

export function faqNode(faqs: { q: string; a: string }[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function JsonLd({ nodes }: { nodes: JsonLdNode[] }) {
  const doc = { "@context": "https://schema.org", "@graph": nodes };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(doc) }}
    />
  );
}
