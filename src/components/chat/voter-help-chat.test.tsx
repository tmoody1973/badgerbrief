import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getOrCreateGuestId, guestArgs, MdText } from "./voter-help-chat";

/** In-memory localStorage stand-in — the real global throws in this test
 * environment ("--localstorage-file was not provided"). */
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

/** The chat previously rendered assistant markdown as literal characters (only
 * links were handled). These assert real markdown now renders to real elements. */
describe("MdText", () => {
  test("renders bold, bullet lists, and safe external links", () => {
    const html = renderToStaticMarkup(
      <MdText text={"**Register by Oct 15.**\n\n- Bring an ID\n- Check your ward\n\n[wisconsin.gov](https://myvote.wi.gov)"} />,
    );
    expect(html).toContain("<strong");
    expect(html).toContain("Register by Oct 15.");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>Bring an ID</li>");
    // external link opens safely, not rendered as literal [text](url)
    expect(html).toContain('href="https://myvote.wi.gov"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("**Register");
    expect(html).not.toContain("[wisconsin.gov]");
  });

  test("renders numbered lists", () => {
    const html = renderToStaticMarkup(
      <MdText text={"1. First\n2. Second"} />,
    );
    expect(html).toContain("<ol");
    expect(html).toContain("<li>First</li>");
  });

  test("does not render raw HTML from model output (no injection)", () => {
    const html = renderToStaticMarkup(
      <MdText text={"<script>alert(1)</script> plain"} />,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("plain");
  });
});

describe("getOrCreateGuestId", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("creates and persists an id when none exists", () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-1111-1111-111111111111" });

    const id = getOrCreateGuestId();

    expect(id).toBe("11111111-1111-1111-1111-111111111111");
    expect(storage.getItem("bb_guest_id")).toBe(id);
  });

  test("reuses the stored id instead of minting a new one", () => {
    const storage = fakeLocalStorage();
    storage.setItem("bb_guest_id", "existing-id");
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("crypto", { randomUUID: () => "should-not-be-used" });

    expect(getOrCreateGuestId()).toBe("existing-id");
  });
});

/** These pin the args wiring: guests can't reach any of the three Convex
 * calls without a guestId, and signed-in users never send one (MOO-410). */
describe("guestArgs", () => {
  test("authenticated: passes extra args through, guestId never included", () => {
    expect(guestArgs(true, null)).toEqual({});
    expect(guestArgs(true, "irrelevant", { threadId: "t1" })).toEqual({ threadId: "t1" });
  });

  test("guest without an id yet: skip — never fire with an undefined guestId", () => {
    expect(guestArgs(false, null)).toBe("skip");
    expect(guestArgs(false, null, { threadId: "t1" })).toBe("skip");
  });

  test("guest with an id: guestId is passed alongside any extra args", () => {
    expect(guestArgs(false, "guest-1")).toEqual({ guestId: "guest-1" });
    expect(guestArgs(false, "guest-1", { threadId: "t1" })).toEqual({
      threadId: "t1",
      guestId: "guest-1",
    });
  });
});

/** Signed-out users used to hit a "Sign in to use Voter Help" wall instead of
 * the chat (pre-MOO-410). Guests are now first-class: the wall is gone and
 * the same input renders for everyone. */
describe("VoterHelpChat — signed-out rendering (MOO-410)", () => {
  afterEach(() => vi.resetModules());

  test("signed-out visitor sees the chat input, not a sign-in wall", async () => {
    // The top-of-file static import already cached the real "convex/react" —
    // clear the module registry so the dynamic import below re-resolves it.
    vi.resetModules();
    vi.doMock("convex/react", () => ({
      useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
      useQuery: () => undefined,
      useMutation: () => vi.fn(),
    }));
    vi.doMock("@convex-dev/agent/react", () => ({
      useThreadMessages: () => ({ results: [] }),
      toUIMessages: () => [],
      useSmoothText: (text: string) => [text],
    }));

    const { VoterHelpChat } = await import("./voter-help-chat");
    const html = renderToStaticMarkup(<VoterHelpChat />);

    expect(html).not.toContain("Sign in to use Voter Help");
    expect(html).toContain('aria-label="Ask a voting question"');
    expect(html).toContain("Try asking");
  });
});
