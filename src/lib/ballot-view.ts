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
 * The shared ballot's "#cd=4&sd=7&ad=19", remembered for the visit. Jumping to
 * a section of the page ("#questions") replaces the "#" part of the address,
 * and the ballot the visitor came to see must not vanish when they do that.
 */
const LOOKS_LIKE_A_BALLOT = /(?:^#?|&)cd=/;
let linked = "";
const listeners = new Set<() => void>();

/** For useSyncExternalStore. The text of the link's "#" part, "" when the visitor did not arrive by one. */
export function linkedBallotSnapshot(): string {
  if (typeof window === "undefined") return linked;
  const hash = window.location.hash;
  if (LOOKS_LIKE_A_BALLOT.test(hash)) linked = hash;
  return linked;
}

/** Call after clearing the address bar, once the visitor has looked up their own address. */
export function forgetLinkedBallot(): void {
  linked = "";
  for (const listener of listeners) listener();
}

export function subscribeLinkedBallot(onChange: () => void): () => void {
  listeners.add(onChange);
  if (typeof window !== "undefined") window.addEventListener("hashchange", onChange);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("hashchange", onChange);
  };
}
