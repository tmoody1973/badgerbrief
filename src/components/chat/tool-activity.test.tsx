import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { UIMessage } from "@convex-dev/agent/react";
import { ToolActivity, isShown, toolLabels } from "./tool-activity";

/** An assistant answer as the agent library hands it to the page. */
const answer = (parts: unknown[], text = "", status = "success") =>
  ({ key: "k", role: "assistant", text, status, parts }) as unknown as UIMessage;

const call = (toolName: string, input: unknown = {}) => ({
  type: `tool-${toolName}`,
  toolCallId: `c-${toolName}`,
  input,
  state: "input-available",
});

describe("toolLabels", () => {
  test("names each source checked in plain words, once, in the order used", () => {
    const m = answer([
      call("getCandidateInfo", { slug: "david-crowley" }),
      call("getCandidateInfo", { slug: "tom-tiffany" }),
      { type: "text", text: "…" },
      call("getQuestionnaireAnswers", { raceId: "WI-GOV-2026" }),
    ]);
    expect(toolLabels(m)).toEqual(["Candidate records", "Wisconsin Watch questionnaire"]);
  });

  test("a tool with no plain-words label is left out rather than shown by its code name", () => {
    expect(toolLabels(answer([call("someFutureTool")]))).toEqual([]);
  });
});

describe("ToolActivity", () => {
  test("after the answer arrives, says what was checked", () => {
    const html = renderToStaticMarkup(
      <ToolActivity message={answer([call("getQuestionnaireAnswers")], "Here is what they said.")} />,
    );
    expect(html).toContain("Checked");
    expect(html).toContain("Wisconsin Watch questionnaire");
  });

  test("while the answer is still being written, says what it is checking", () => {
    const html = renderToStaticMarkup(
      <ToolActivity message={answer([call("getRaceInfo")], "", "streaming")} />,
    );
    expect(html).toContain("Checking");
    expect(html).toContain("Race records");
  });

  test("never shows what was passed to a tool", () => {
    const html = renderToStaticMarkup(
      <ToolActivity message={answer([call("getMyBallot", { address: "200 E Wells St" })], "Your ballot.")} />,
    );
    expect(html).not.toContain("200 E Wells");
  });

  test("shows nothing for an answer that checked nothing", () => {
    expect(renderToStaticMarkup(<ToolActivity message={answer([], "Hi.")} />)).toBe("");
  });
});

describe("isShown", () => {
  test("an answer still looking things up is shown, so the voter sees it working", () => {
    expect(isShown(answer([call("getRaceInfo")], "", "streaming"))).toBe(true);
  });

  test("an empty answer with nothing checked stays hidden", () => {
    expect(isShown(answer([], "  "))).toBe(false);
  });

  test("the voter's own messages are always shown", () => {
    expect(isShown({ role: "user", text: "", parts: [] } as unknown as UIMessage)).toBe(true);
  });
});
