import { describe, expect, test } from "vitest";
import { parseLrbFirstSentence } from "./billAnalysis";

// The real markup: an analysis body div with <br/> line-wraps and LRB's
// double-space after each sentence-ending period.
const AB388 =
  '<div class="qs_anal_text_" data-path="/x">\n' +
  "This bill creates a child care center renovations revolving loan program, under <br/>" +
  "which the Wisconsin Economic Development Corporation must award loans to <br/>" +
  "licensed child care providers for the purpose of making renovations to their facilities.  <br/>" +
  "Under the bill, 60 percent of the loans must go to in-home licensed child care <br/>providers." +
  "</div>";

describe("parseLrbFirstSentence", () => {
  test("returns the first LRB analysis sentence, tags and line-wraps removed", () => {
    expect(parseLrbFirstSentence(AB388)).toBe(
      "This bill creates a child care center renovations revolving loan program, under which the Wisconsin Economic Development Corporation must award loans to licensed child care providers for the purpose of making renovations to their facilities.",
    );
  });

  test("returns null when there is no analysis section (e.g. a resolution)", () => {
    expect(parseLrbFirstSentence("<div class='qs_prefix_'>SESSION SCHEDULE</div>")).toBeNull();
    expect(parseLrbFirstSentence("")).toBeNull();
  });

  test("does not split on a single-space statutory cite or a decimal", () => {
    // "s. 20.005" (single space) and "20.005" (decimal) must not end the sentence;
    // only the double-space before "The Department" does.
    const html =
      '<div class="qs_anal_text_">This bill amends s. 20.005 (1) of the statutes to appropriate $1.5 million.  ' +
      "The Department administers the grant.</div>";
    expect(parseLrbFirstSentence(html)).toBe(
      "This bill amends s. 20.005 (1) of the statutes to appropriate $1.5 million.",
    );
  });

  test("caps a run-on first block that has no double-space boundary", () => {
    const long = "This bill does a thing " + "and another ".repeat(60); // >320 chars, no ". "
    expect(parseLrbFirstSentence(`<div class="qs_anal_text_">${long}</div>`)!.length).toBeLessThanOrEqual(305);
  });
});
