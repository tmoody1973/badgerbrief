import Link from "next/link";
import { EXPLAINERS, type ExplainerTopic } from "@/lib/explainers";

export function WhatThisMeans({
  topic,
  className,
}: {
  topic: ExplainerTopic;
  className?: string;
}) {
  const e = EXPLAINERS[topic];
  return (
    <details className={`mt-2 border-2 border-border bg-muted/40 px-3 py-2 ${className ?? ""}`}>
      <summary className="cursor-pointer select-none font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        ⓘ {e.summary}
      </summary>
      <p className="mt-2 max-w-[60ch] text-sm">{e.body}</p>
      {e.learnMore && (
        <Link
          href={e.learnMore}
          className="mt-2 inline-block text-sm font-bold underline decoration-2"
        >
          How we do this →
        </Link>
      )}
    </details>
  );
}
