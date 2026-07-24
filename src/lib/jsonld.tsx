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

/**
 * The /news hub as a CollectionPage wrapping an ItemList of the coverage we
 * track. Every other template already carried structured data while the
 * freshest, most-crawled page on the site carried none.
 *
 * Each item points at the PUBLISHER's url, not ours: BadgerBrief indexes other
 * outlets' reporting and does not host it, so claiming these as our own
 * articles would misattribute someone else's work. `isBasedOn` + a named
 * publisher keeps the attribution explicit, which is also what an answer engine
 * needs to cite the right outlet rather than us.
 */
export function newsCollectionNode(
  items: { headline: string; url: string; outlet: string; publishedAt?: string }[],
): JsonLdNode {
  return {
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/news#collection`,
    name: "Wisconsin 2026 election news",
    url: `${SITE_URL}/news`,
    isPartOf: { "@id": `${SITE_URL}/#org` },
    description:
      "Tracked coverage of Wisconsin's 2026 races from named outlets, with source transparency on every publisher.",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: a.url,
        item: {
          "@type": "NewsArticle",
          headline: a.headline,
          url: a.url,
          ...(a.publishedAt ? { datePublished: a.publishedAt } : {}),
          publisher: { "@type": "Organization", name: a.outlet },
        },
      })),
    },
  };
}
