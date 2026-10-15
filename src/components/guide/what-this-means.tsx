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
    <details className={`mt-2 border-2 border-border bg-muted/40 px-3 ${className ?? ""}`}>
      <summary className="cursor-pointer select-none py-3.5 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        ⓘ {e.summary}
      </summary>
      <p className="max-w-[60ch] pb-2 text-sm">{e.body}</p>
      {e.learnMore && (
        <Link
          href={e.learnMore}
          className="inline-flex min-h-11 items-center text-sm font-bold underline decoration-2"
        >
          How we do this →
        </Link>
      )}
    </details>
  );
}
