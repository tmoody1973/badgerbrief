// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DISTRICTS_KEY,
  ORDER_KEY,
  clearStoredDistricts,
  readStoredDistricts,
  readStoredOrder,
  storeDistricts,
  storeOrder,
  storedDistrictsSnapshot,
  subscribeBallotStorage,
} from "./ballot-storage";

const KNOWN = new Set(["milwaukee"]);
const MILWAUKEE = { congressional: 4, senate: 7, assembly: 19, county: "milwaukee" };

/** In-memory localStorage stand-in, as in src/components/chat/voter-help-chat.test.tsx. */
function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } satisfies Storage;
}

function withStorage(localStorage: Storage) {
  const windowListeners = new Map<string, () => void>();
  vi.stubGlobal("window", {
    localStorage,
    addEventListener: (type: string, fn: () => void) => void windowListeners.set(type, fn),
    removeEventListener: (type: string) => void windowListeners.delete(type),
  });
  return windowListeners;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // With no window nothing is kept, which also empties what a blocked browser left in memory.
  clearStoredDistricts();
  storeOrder("attention");
});

describe("districts on the device", () => {
  test("stores and reads back districts, with a county and without", () => {
    withStorage(fakeLocalStorage());
    storeDistricts(MILWAUKEE);
    expect(readStoredDistricts(KNOWN)).toEqual(MILWAUKEE);
    storeDistricts({ congressional: 2, senate: 26, assembly: 76 });
    expect(readStoredDistricts(KNOWN)).toEqual({ congressional: 2, senate: 26, assembly: 76 });
  });

  test("what is stored is districts and county, and nothing that could be an address", () => {
    const storage = fakeLocalStorage();
    withStorage(storage);
    storeDistricts(MILWAUKEE);
    expect(storage.getItem(DISTRICTS_KEY)).toBe("cd=4&sd=7&ad=19&co=milwaukee");
    expect(storage.length).toBe(1);
  });

  test("a stored value that no longer checks out reads as nothing", () => {
    const storage = fakeLocalStorage();
    withStorage(storage);
    storage.setItem(DISTRICTS_KEY, "cd=99&sd=7&ad=19");
    expect(readStoredDistricts(KNOWN)).toBeNull();
    storage.setItem(DISTRICTS_KEY, "{\"address\":\"200 E Wells St\"}");
    expect(readStoredDistricts(KNOWN)).toBeNull();
  });

  test("clearing removes it", () => {
    withStorage(fakeLocalStorage());
    storeDistricts(MILWAUKEE);
    clearStoredDistricts();
    expect(readStoredDistricts(KNOWN)).toBeNull();
    expect(storedDistrictsSnapshot()).toBe("");
  });

  test("the snapshot is the same text until something is stored, so React does not re-render forever", () => {
    withStorage(fakeLocalStorage());
    storeDistricts(MILWAUKEE);
    expect(storedDistrictsSnapshot()).toBe(storedDistrictsSnapshot());
    expect(storedDistrictsSnapshot()).toBe("cd=4&sd=7&ad=19&co=milwaukee");
  });
});

describe("the order the visitor chose", () => {
  test("decisions first, unless ballot order was chosen", () => {
    const storage = fakeLocalStorage();
    withStorage(storage);
    expect(readStoredOrder()).toBe("attention");
    storeOrder("ballot");
    expect(readStoredOrder()).toBe("ballot");
    expect(storage.getItem(ORDER_KEY)).toBe("ballot");
    storeOrder("attention");
    expect(readStoredOrder()).toBe("attention");
  });

  test("anything else stored reads as decisions first", () => {
    const storage = fakeLocalStorage();
    withStorage(storage);
    storage.setItem(ORDER_KEY, "sideways");
    expect(readStoredOrder()).toBe("attention");
  });
});

describe("when storage is not available", () => {
  const broken = () => {
    const fail = () => {
      throw new Error("storage is disabled");
    };
    return { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 } as unknown as Storage;
  };

  test("blocked storage never throws, and the page still works for this visit", () => {
    withStorage(broken());
    expect(readStoredDistricts(KNOWN)).toBeNull();
    expect(() => storeDistricts(MILWAUKEE)).not.toThrow();
    expect(() => storeOrder("ballot")).not.toThrow();
    // A voter who just looked up their address must see their ballot, storage or no storage.
    expect(readStoredDistricts(KNOWN)).toEqual(MILWAUKEE);
    expect(storedDistrictsSnapshot()).toBe("cd=4&sd=7&ad=19&co=milwaukee");
    expect(readStoredOrder()).toBe("ballot");
    expect(() => clearStoredDistricts()).not.toThrow();
    expect(readStoredDistricts(KNOWN)).toBeNull();
  });

  test("storage that is full keeps the old value on disk but shows the new one for this visit", () => {
    const storage = fakeLocalStorage();
    storage.setItem(DISTRICTS_KEY, "cd=2&sd=26&ad=76");
    withStorage({ ...storage, getItem: storage.getItem, setItem: () => { throw new Error("QuotaExceededError"); } } as Storage);
    storeDistricts(MILWAUKEE);
    expect(readStoredDistricts(KNOWN)).toEqual(MILWAUKEE);
  });

  test("a browser that refuses even to hand over localStorage never throws, and still works for this visit", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
      addEventListener() {},
      removeEventListener() {},
    });
    expect(() => storeDistricts(MILWAUKEE)).not.toThrow();
    expect(readStoredDistricts(KNOWN)).toEqual(MILWAUKEE);
  });

  test("once storage works again, it is used and the in-memory copy is dropped", () => {
    withStorage(broken());
    storeDistricts(MILWAUKEE);
    const storage = fakeLocalStorage();
    withStorage(storage);
    storeDistricts({ congressional: 2, senate: 26, assembly: 76 });
    expect(storage.getItem(DISTRICTS_KEY)).toBe("cd=2&sd=26&ad=76");
    expect(readStoredDistricts(KNOWN)).toEqual({ congressional: 2, senate: 26, assembly: 76 });
  });

  test("on the server, where there is no window, nothing is read, kept or thrown", () => {
    expect(() => storeDistricts(MILWAUKEE)).not.toThrow();
    // One visitor's districts must never be kept in the server's memory for the next.
    expect(readStoredDistricts(KNOWN)).toBeNull();
    expect(storedDistrictsSnapshot()).toBe("");
    expect(readStoredOrder()).toBe("attention");
  });
});

describe("telling the page something changed", () => {
  test("a write in this tab notifies; an unsubscribed listener is left alone", () => {
    withStorage(fakeLocalStorage());
    const heard = vi.fn();
    const stop = subscribeBallotStorage(heard);
    storeDistricts(MILWAUKEE);
    storeOrder("ballot");
    clearStoredDistricts();
    expect(heard).toHaveBeenCalledTimes(3);
    stop();
    storeDistricts(MILWAUKEE);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  test("listens for writes from other tabs, and stops when asked", () => {
    const windowListeners = withStorage(fakeLocalStorage());
    const stop = subscribeBallotStorage(() => {});
    expect(windowListeners.has("storage")).toBe(true);
    stop();
    expect(windowListeners.has("storage")).toBe(false);
  });
});
