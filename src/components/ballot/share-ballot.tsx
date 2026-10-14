"use client";

import { ShareButton } from "@/components/contribute/share-button";
import { districtsToHash } from "@/lib/ballot-link";
import type { Districts } from "@/lib/districts";
import { SITE_URL } from "@/lib/site";

/**
 * Share a ballot as a link that carries districts and county after the "#",
 * which browsers send to no server (decision 018). The sentence above the
 * button says what the link carries before anyone sends it.
 */
export function ShareBallot({ districts }: { districts: Districts }) {
  return (
    <>
      <p className="mt-2 max-w-2xl">
        {districts.county
          ? "The link shows the districts and county you vote in. Together they can point to a small area, especially in a rural county."
          : "The link shows the districts you vote in."}{" "}
        It never carries your address.
      </p>
      <div className="mt-3">
        <ShareButton url={`${SITE_URL}/ballot#${districtsToHash(districts)}`} title="My Wisconsin ballot, November 3, 2026" channels="private" />
      </div>
    </>
  );
}
