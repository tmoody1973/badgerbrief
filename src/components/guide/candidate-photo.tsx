"use client";

import { useState } from "react";

type CandidatePhotoProps = {
  photoUrl?: string;
  photoSource?: string;
  name: string;
};

/** Header photo for a candidate page. Plain <img> (remote domains vary too
 * much for next/image remotePatterns); onError hides the img instead of
 * showing a broken-image icon. Fixed box size avoids layout shift. */
export function CandidatePhoto({
  photoUrl,
  photoSource,
  name,
}: CandidatePhotoProps) {
  const [errored, setErrored] = useState(false);
  if (!photoUrl || errored) return null;

  return (
    <div className="flex-shrink-0">
      <div className="h-24 w-24 overflow-hidden border-2 border-border bg-muted shadow-[var(--shadow-brutal)] sm:h-32 sm:w-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      </div>
      {photoSource && (
        <p className="mt-1 max-w-24 font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:max-w-32">
          Photo: {photoSource}
        </p>
      )}
    </div>
  );
}
