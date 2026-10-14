// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { chooseShown, createLinkedBallot } from "./ballot-view";

const LINK = { congressional: 2, senate: 26, assembly: 76 };
const DEVICE = { congressional: 4, senate: 7, assembly: 19, county: "milwaukee" };
const ACCOUNT = { congressional: 7, senate: 23, assembly: 69 };

describe("chooseShown", () => {
  test("a shared link wins for this visit, over the device and the account", () => {
    expect(chooseShown({ link: LINK, device: DEVICE, account: ACCOUNT })).toEqual({ from: "link", districts: LINK });
  });

  test("with no link, the device wins over the account", () => {
    expect(chooseShown({ link: null, device: DEVICE, account: ACCOUNT })).toEqual({ from: "device", districts: DEVICE });
  });

  test("with only saved account districts, those are shown", () => {
    expect(chooseShown({ link: null, device: null, account: ACCOUNT })).toEqual({ from: "account", districts: ACCOUNT });
  });

  test("with nothing, nothing is shown", () => {
    expect(chooseShown({ link: null, device: null, account: null })).toEqual({ from: "none" });
  });

  test("never blends sources: a link with no county does not borrow the device's county", () => {
    const shown = chooseShown({ link: LINK, device: DEVICE, account: null });
    expect(shown.from === "link" && "county" in shown.districts).toBe(false);
  });
});

describe("the ballot a visitor arrived at by link", () => {
  /** One browser tab: its address bar, and the storage that lasts as long as the tab does. */
  function browser(hash: string, tab: Map<string, string> | "blocked" = new Map()) {
    const location = { hash, pathname: "/ballot", search: "" };
    const listeners = new Map<string, () => void>();
    const replaceState = vi.fn((_state: unknown, _unused: string, url: string) => {
      location.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    });
    const blocked = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("window", {
      location,
      history: { state: { router: "its own state" }, replaceState },
      sessionStorage:
        tab === "blocked"
          ? { getItem: blocked, setItem: blocked, removeItem: blocked }
          : { getItem: (k: string) => tab.get(k) ?? null, setItem: (k: string, v: string) => void tab.set(k, v), removeItem: (k: string) => void tab.delete(k) },
      addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
      removeEventListener: (type: string) => void listeners.delete(type),
    });
    /** What the browser does when the part after the "#" really changes. */
    const go = (next: string) => {
      location.hash = next;
      listeners.get("hashchange")?.();
    };
    return { location, listeners, go, replaceState, tab };
  }

  // A fresh store for each test: the real one lives for the life of the page.
  let store = createLinkedBallot();
  const linkedBallotSnapshot = () => store.snapshot();
  const forgetLinkedBallot = () => store.forget();
  const subscribeLinkedBallot = (onChange: () => void) => store.subscribe(onChange);

  let stop = () => {};
  const open = () => {
    stop = subscribeLinkedBallot(() => {});
  };

  beforeEach(() => {
    store = createLinkedBallot();
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  test("is taken from the address when the page opens", () => {
    browser("#cd=4&sd=7&ad=19&co=milwaukee");
    open();
    expect(linkedBallotSnapshot()).toBe("#cd=4&sd=7&ad=19&co=milwaukee");
  });

  test("reading it never looks at the address, so React gets the same answer every time", () => {
    const { location } = browser("#cd=4&sd=7&ad=19");
    open();
    location.hash = "#cd=2&sd=26&ad=76"; // changed behind the page's back, with no event
    expect(linkedBallotSnapshot()).toBe("#cd=4&sd=7&ad=19");
  });

  test("survives a jump to a section of the page, which replaces the # with the section's name", () => {
    const { go } = browser("#cd=4&sd=7&ad=19");
    open();
    go("#decisions");
    expect(linkedBallotSnapshot()).toBe("#cd=4&sd=7&ad=19");
  });

  test("a section name alone is not a ballot", () => {
    browser("#questions");
    open();
    expect(linkedBallotSnapshot()).toBe("");
  });

  test("a second link opened in the same tab replaces the first", () => {
    const { go } = browser("#cd=4&sd=7&ad=19");
    open();
    go("#cd=2&sd=26&ad=76");
    expect(linkedBallotSnapshot()).toBe("#cd=2&sd=26&ad=76");
  });

  test("is forgotten once the visitor moves to their own ballot, and listeners are told", () => {
    browser("#cd=4&sd=7&ad=19");
    const heard = vi.fn();
    stop = subscribeLinkedBallot(heard);
    heard.mockClear();
    forgetLinkedBallot();
    expect(linkedBallotSnapshot()).toBe("");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  test("a link the visitor has moved past does not come back when the address bar shows it again", () => {
    // Next's router re-applies the address a page was loaded with, "#" and all,
    // when the visitor taps a link to the same page.
    const { go } = browser("#cd=7&sd=31&ad=93&co=st-croix");
    open();
    forgetLinkedBallot();

    go("#cd=7&sd=31&ad=93&co=st-croix");
    expect(linkedBallotSnapshot()).toBe("");

    stop();
    open(); // the page is opened again, with the old link still in the bar
    expect(linkedBallotSnapshot()).toBe("");
  });

  test("moving on clears the link from the address bar, keeping the router's own history state", () => {
    const { location, replaceState } = browser("#cd=7&sd=31&ad=93&co=st-croix");
    open();
    forgetLinkedBallot();
    expect(location.hash).toBe("");
    expect(replaceState).toHaveBeenCalledWith({ router: "its own state" }, "", "/ballot");
  });

  test("when the dismissed link reappears in the address bar, it is cleared again", () => {
    const { location, go, replaceState } = browser("#cd=7&sd=31&ad=93&co=st-croix");
    open();
    forgetLinkedBallot();
    replaceState.mockClear();

    go("#cd=7&sd=31&ad=93&co=st-croix");
    expect(location.hash).toBe("");
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  test("a reload in the same tab still ignores the link the visitor moved past, and clears it", () => {
    const tab = new Map<string, string>();
    browser("#cd=7&sd=31&ad=93&co=st-croix", tab);
    open();
    forgetLinkedBallot();
    stop();

    // The page is loaded afresh: a new store, the same tab, the old link back in the bar.
    const reloaded = browser("#cd=7&sd=31&ad=93&co=st-croix", tab);
    store = createLinkedBallot();
    open();
    expect(linkedBallotSnapshot()).toBe("");
    expect(reloaded.location.hash).toBe("");
  });

  test("a new tab honours the same link again", () => {
    browser("#cd=7&sd=31&ad=93", new Map());
    open();
    forgetLinkedBallot();
    stop();

    browser("#cd=7&sd=31&ad=93", new Map());
    store = createLinkedBallot();
    open();
    expect(linkedBallotSnapshot()).toBe("#cd=7&sd=31&ad=93");
  });

  test("with the tab's storage blocked, moving on still works for the life of the page", () => {
    const { go } = browser("#cd=7&sd=31&ad=93", "blocked");
    open();
    expect(() => forgetLinkedBallot()).not.toThrow();
    go("#cd=7&sd=31&ad=93");
    expect(linkedBallotSnapshot()).toBe("");
  });

  test("a section jump is never cleared from the address bar", () => {
    const { location, go, replaceState } = browser("#cd=7&sd=31&ad=93");
    open();
    forgetLinkedBallot();
    replaceState.mockClear();
    go("#questions");
    expect(location.hash).toBe("#questions");
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("a different link is still honoured after one was dismissed", () => {
    const { go } = browser("#cd=7&sd=31&ad=93");
    open();
    forgetLinkedBallot();
    go("#cd=2&sd=26&ad=76");
    expect(linkedBallotSnapshot()).toBe("#cd=2&sd=26&ad=76");
  });

  test("listens for the address changing, and stops when asked", () => {
    const { listeners } = browser("");
    const end = subscribeLinkedBallot(() => {});
    expect(listeners.has("hashchange")).toBe(true);
    end();
    expect(listeners.has("hashchange")).toBe(false);
  });

  test("on the server there is no link", () => {
    expect(linkedBallotSnapshot()).toBe("");
  });
});
