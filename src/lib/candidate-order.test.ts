// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lastName, byLastName, labelForSlug } from "./candidate-order";

describe("candidate-order", () => {
  it("lastName takes the final whitespace token, lowercased", () => {
    expect(lastName("Bo Barnes")).toBe("barnes");
    expect(lastName("  Ann  Marie  Smith ")).toBe("smith");
  });
  it("byLastName sorts by last name A–Z", () => {
    const xs = [{ name: "Cy Lee" }, { name: "Bo Barnes" }, { name: "Ann Smith" }];
    expect(xs.slice().sort(byLastName).map((x) => x.name)).toEqual(["Bo Barnes", "Cy Lee", "Ann Smith"]);
  });
  it("labelForSlug title-cases slug tokens", () => {
    expect(labelForSlug("gun-policy")).toBe("Gun Policy");
    expect(labelForSlug("abortion")).toBe("Abortion");
    expect(labelForSlug("economy_jobs")).toBe("Economy Jobs");
  });
});
