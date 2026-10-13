// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { chooseShown, forgetLinkedBallot, linkedBallotSnapshot, subscribeLinkedBallot } from "./ballot-view";

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
    expect(shown).toEqual({ from: "link", districts: LINK });
    expect("county" in LINK).toBe(false);
  });
});

describe("the ballot a visitor arrived at by link", () => {
  function browser(hash: string) {
    const location = { hash };
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("window", {
      location,
      addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
      removeEventListener: (type: string) => void listeners.delete(type),
    });
    return { location, listeners };
  }

  afterEach(() => {
    forgetLinkedBallot();
    vi.unstubAllGlobals();
  });

  test("reads the districts after the #", () => {
    browser("#cd=4&sd=7&ad=19&co=milwaukee");
    expect(linkedBallotSnapshot()).toBe("#cd=4&sd=7&ad=19&co=milwaukee");
  });

  test("survives a jump to a section of the page, which replaces the # with the section's name", () => {
    const { location } = browser("#cd=4&sd=7&ad=19");
    linkedBallotSnapshot();
    location.hash = "#decisions";
    expect(linkedBallotSnapshot()).toBe("#cd=4&sd=7&ad=19");
  });

  test("a section name alone is not a ballot", () => {
    browser("#questions");
    expect(linkedBallotSnapshot()).toBe("");
  });

  test("a second link opened in the same tab replaces the first", () => {
    const { location } = browser("#cd=4&sd=7&ad=19");
    linkedBallotSnapshot();
    location.hash = "#cd=2&sd=26&ad=76";
    expect(linkedBallotSnapshot()).toBe("#cd=2&sd=26&ad=76");
  });

  test("is forgotten once the visitor looks up their own address, and listeners are told", () => {
    const { location } = browser("#cd=4&sd=7&ad=19");
    linkedBallotSnapshot();
    const heard = vi.fn();
    const stop = subscribeLinkedBallot(heard);
    location.hash = "";
    forgetLinkedBallot();
    expect(linkedBallotSnapshot()).toBe("");
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });

  test("listens for the address changing, and stops when asked", () => {
    const { listeners } = browser("");
    const stop = subscribeLinkedBallot(() => {});
    expect(listeners.has("hashchange")).toBe(true);
    stop();
    expect(listeners.has("hashchange")).toBe(false);
  });

  test("on the server there is no link", () => {
    expect(linkedBallotSnapshot()).toBe("");
  });
});
