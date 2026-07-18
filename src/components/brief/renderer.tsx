"use client";

import { useState } from "react";
import { Renderer, type OpenUIError } from "@openuidev/react-lang";
import { briefLibrary } from "@/lib/brief/library";

/** Renders OpenUI Lang against the brief registry. MOO-311 streams into this. */
export function BriefRenderer({
  source,
  isStreaming = false,
}: {
  source: string | null;
  isStreaming?: boolean;
}) {
  const [errors, setErrors] = useState<OpenUIError[]>([]);
  return (
    <div>
      <Renderer
        library={briefLibrary}
        response={source}
        isStreaming={isStreaming}
        onError={setErrors}
      />
      {errors.length > 0 && !isStreaming && (
        <p className="mt-4 border-2 border-dashed border-border p-3 text-sm text-muted-foreground">
          Some sections of this brief couldn&apos;t be displayed.
        </p>
      )}
    </div>
  );
}
