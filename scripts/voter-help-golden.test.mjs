import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const rows = JSON.parse(readFileSync(new URL("./voter-help-golden.json", import.meta.url), "utf8"));

describe("the chat's test questions", () => {
  test("every question has the three fields the judge reads", () => {
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["category", "expectations", "question"]);
      expect(row.question.length).toBeGreaterThan(8);
      expect(row.expectations.length).toBeGreaterThan(40);
    }
    expect(new Set(rows.map((r) => r.question)).size).toBe(rows.length);
  });

  test("none still expects a primary answer", () => {
    for (const row of rows) {
      expect(row.expectations).not.toMatch(/Aug 11, 2026 partisan primary|legislative primary, not/);
      expect(row.question).not.toMatch(/in the Wisconsin primary\?/);
    }
  });

  test("the November cases the design asks for are present", () => {
    const categories = rows.map((r) => r.category);
    for (const needed of ["ballot-status", "joint-ticket", "write-in", "results-trap", "label-glossary"]) {
      expect(categories).toContain(needed);
    }
    expect(rows.length).toBe(28);
  });

  test("the cases that worked before are still covered", () => {
    const count = (c) => rows.filter((r) => r.category === c).length;
    expect(count("procedural")).toBeGreaterThanOrEqual(5);
    expect(count("refusal-endorsement")).toBeGreaterThanOrEqual(2);
    expect(count("unknown-data")).toBeGreaterThanOrEqual(2);
    expect(count("voting-record-federal")).toBeGreaterThanOrEqual(2);
  });

  test("the questionnaire cases cover an even race, an uneven race and a candidate with no page", () => {
    const categories = rows.map((r) => r.category);
    for (const needed of ["questionnaire", "questionnaire-uneven", "questionnaire-missing"]) expect(categories).toContain(needed);
    const uneven = rows.find((r) => r.category === "questionnaire-uneven");
    expect(uneven.expectations).toMatch(/shows no response/i);
    expect(uneven.expectations).toMatch(/without speculating/i);
  });
});
