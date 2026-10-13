/**
 * Whose ballot My Ballot is showing, and where that came from.
 *
 * Three places can hold districts: a link someone shared, this device, and a
 * signed-in account. They are never blended. A link wins for the visit, so a
 * visitor sees what the sender meant them to see, and their own stored
 * districts are left alone until they look up an address themselves.
 */
import type { Districts } from "./districts";

export type Shown =
  | { from: "link"; districts: Districts }
  | { from: "device"; districts: Districts }
  | { from: "account"; districts: Districts }
  | { from: "none" };

export function chooseShown(input: { link: Districts | null; device: Districts | null; account: Districts | null }): Shown {
  if (input.link) return { from: "link", districts: input.link };
  if (input.device) return { from: "device", districts: input.device };
  if (input.account) return { from: "account", districts: input.account };
  return { from: "none" };
}

/*
 * The shared ballot's "#cd=4&sd=7&ad=19", remembered for the visit.
 *
 * It is taken from the address bar at two moments only: when the page opens,
 * and when the "#" part really changes. It is NOT re-read on every render.
 * Two things depend on that:
 *
 *  - Jumping to a section ("#questions") replaces the "#" part, and the ballot
 *    the visitor came to see must not vanish when they do.
 *  - Once the visitor has moved on to their own ballot, the link must not
 *    come back. Next's router remembers the address a page was first loaded
 *    with, "#" and all, and puts it back in the address bar every time the
 *    visitor navigates to that page again; neither router.replace nor
 *    history.replaceState stops it. So the link the visitor moved past is
 *    remembered for the life of the tab, is never adopted again, and is
 *    cleared from the address bar whenever the page finds it there.
 */
const LOOKS_LIKE_A_BALLOT = /(?:^#?|&)cd=/;
// Per tab, so a reload does not bring the link back. Holds someone else's districts, never the visitor's.
const DISMISSED_KEY = "bb-ballot-link-dismissed";

function tabRead(): string {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) ?? "";
  } catch {
    return "";
  }
}

function tabWrite(value: string) {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // The tab's storage is blocked: remembered for the life of the page only.
  }
}

/** Take the "#" part out of the address bar, leaving the router's own history state as it was. */
function clearAddressBar() {
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
}

export function createLinkedBallot() {
  let linked = "";
  let dismissed = "";
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const listener of listeners) listener();
  };

  const adopt = () => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!LOOKS_LIKE_A_BALLOT.test(hash) || hash === linked) return;
    if (hash === (dismissed || tabRead())) {
      dismissed = hash;
      clearAddressBar();
      return;
    }
    linked = hash;
    tell();
  };

  return {
    /** For useSyncExternalStore. The link's "#" part, "" when the visitor did not arrive by one. */
    snapshot: (): string => linked,
    /** The visitor has moved on to their own ballot. */
    forget: (): void => {
      if (linked) {
        dismissed = linked;
        if (typeof window !== "undefined") {
          tabWrite(dismissed);
          if (LOOKS_LIKE_A_BALLOT.test(window.location.hash)) clearAddressBar();
        }
      }
      linked = "";
      tell();
    },
    subscribe: (onChange: () => void): (() => void) => {
      listeners.add(onChange);
      if (typeof window !== "undefined") window.addEventListener("hashchange", adopt);
      adopt();
      return () => {
        listeners.delete(onChange);
        if (typeof window !== "undefined") window.removeEventListener("hashchange", adopt);
      };
    },
  };
}

const page = createLinkedBallot();
export const linkedBallotSnapshot = page.snapshot;
export const forgetLinkedBallot = page.forget;
export const subscribeLinkedBallot = page.subscribe;
