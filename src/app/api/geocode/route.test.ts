// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import mke from "@/lib/__fixtures__/census-mke-county.json";
import { GET, POST } from "./route";

afterEach(() => vi.unstubAllGlobals());

/** Stands in for the federal lookup. Records the addresses it was asked for. */
function stubCensus(reply: () => Response = () => Response.json(mke)) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      asked.push(new URL(input).searchParams.get("address") ?? "");
      return reply();
    }),
  );
  return asked;
}

const post = (body: string, visitor: string) =>
  POST(new NextRequest("http://localhost/api/geocode", { method: "POST", body, headers: { "content-type": "application/json", "x-forwarded-for": visitor } }));
const ask = (address: string, visitor: string) => post(JSON.stringify({ address }), visitor);

describe("POST /api/geocode", () => {
  test("returns the districts and county for an address sent in the request body", async () => {
    const asked = stubCensus();
    const res = await ask("200 E Wells St, Milwaukee, WI 53202", "198.51.100.1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, congressional: 4, senate: 7, assembly: 19, county: "milwaukee" });
    expect(asked).toEqual(["200 E Wells St, Milwaukee, WI 53202"]);
  });

  test("the answer is never stored by a cache, and the address appears in no response header", async () => {
    stubCensus();
    const res = await ask("200 E Wells St, Milwaukee, WI 53202", "198.51.100.2");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect([...res.headers.values()].join(" ")).not.toMatch(/wells/i);
  });

  test.each([
    ["a body that is not JSON", "not json"],
    ["a body with no address", JSON.stringify({ street: "200 E Wells St" })],
    ["an address that is not text", JSON.stringify({ address: 12345678 })],
    ["a four-character address", JSON.stringify({ address: "200 " })],
    ["an address over 200 characters", JSON.stringify({ address: "x".repeat(201) })],
    ["an empty body", ""],
  ])("refuses %s without calling the federal service", async (_name, body) => {
    const asked = stubCensus();
    const res = await post(body, "198.51.100.3");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "no_match" });
    expect(asked).toEqual([]);
  });

  test("the thirteenth lookup from one visitor inside ten minutes is refused; another visitor is still served", async () => {
    const asked = stubCensus();
    for (let i = 0; i < 12; i++) expect((await ask("200 E Wells St, Milwaukee", "203.0.113.9")).status).toBe(200);

    const refused = await ask("200 E Wells St, Milwaukee", "203.0.113.9");
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ ok: false, error: "rate_limited" });
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(asked).toHaveLength(12);

    expect((await ask("200 E Wells St, Milwaukee", "203.0.113.10")).status).toBe(200);
  });

  test("a refused request for a malformed address does not use up the visitor's lookups", async () => {
    stubCensus();
    for (let i = 0; i < 20; i++) await post("not json", "203.0.113.20");
    expect((await ask("200 E Wells St, Milwaukee", "203.0.113.20")).status).toBe(200);
  });

  test("when the federal service fails, says so", async () => {
    stubCensus(() => new Response("down", { status: 503 }));
    const res = await ask("200 E Wells St, Milwaukee", "198.51.100.4");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "upstream" });
  });

  test("when the federal service does not answer, says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("timeout"))));
    const res = await ask("200 E Wells St, Milwaukee", "198.51.100.5");
    expect(res.status).toBe(502);
  });
});

describe("GET /api/geocode (kept until the older forms are replaced)", () => {
  test("still answers, under the same limit as POST", async () => {
    const asked = stubCensus();
    const get = () => GET(new NextRequest("http://localhost/api/geocode?address=200%20E%20Wells%20St%2C%20Milwaukee", { headers: { "x-forwarded-for": "203.0.113.30" } }));
    expect((await get()).status).toBe(200);
    for (let i = 0; i < 11; i++) await ask("200 E Wells St, Milwaukee", "203.0.113.30");
    expect((await get()).status).toBe(429);
    expect(asked).toHaveLength(12);
  });
});
