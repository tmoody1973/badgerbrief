/**
 * What My Ballot remembers on the visitor's own device: their districts and
 * county, and which order they chose to read the ballot in. Never an address,
 * and nothing here is sent anywhere.
 *
 * Every access is guarded. Private windows and locked-down browsers refuse
 * storage, sometimes by throwing when it is merely looked at; the page then
 * keeps the value in memory, works for the visit, and forgets on reload.
 */
import { districtsFromHash, districtsToHash } from "./ballot-link";
import type { Districts } from "./districts";

export const DISTRICTS_KEY = "bb-ballot-districts";
export const ORDER_KEY = "bb-ballot-order";

export type BallotOrder = "attention" | "ballot";

/** localStorage fires no event in the tab that wrote it, so writes notify here. */
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/**
 * What the browser refused to store, kept for this visit only. Without it, a
 * voter in a locked-down browser would look up their address and see nothing.
 * Never used on the server, where it would outlive one visitor's request.
 */
const memory = new Map<string, string>();

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  const kept = memory.get(key);
  if (kept !== undefined) return kept;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  memory.delete(key);
  if (typeof window !== "undefined") {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      if (value !== null) memory.set(key, value);
    }
  }
  emit();
}

/**
 * The stored districts as text, "" when there are none. For
 * useSyncExternalStore, which needs the same value back until something
 * changes; parse it with districtsFromHash.
 */
export const storedDistrictsSnapshot = (): string => read(DISTRICTS_KEY) ?? "";

/** The stored districts, checked the same way a share link is. Null when none, or when what is stored no longer checks out. */
export function readStoredDistricts(knownCounties: ReadonlySet<string> | null): Districts | null {
  return districtsFromHash(storedDistrictsSnapshot(), knownCounties);
}

export const storeDistricts = (districts: Districts): void => write(DISTRICTS_KEY, districtsToHash(districts));

export const clearStoredDistricts = (): void => write(DISTRICTS_KEY, null);

/** Decisions first, unless the visitor chose the straight ballot order. */
export const readStoredOrder = (): BallotOrder => (read(ORDER_KEY) === "ballot" ? "ballot" : "attention");

export const storeOrder = (order: BallotOrder): void => write(ORDER_KEY, order);

/** For useSyncExternalStore: fires on this tab's writes and on other tabs'. */
export function subscribeBallotStorage(onChange: () => void): () => void {
  listeners.add(onChange);
  if (typeof window !== "undefined") window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onChange);
  };
}
