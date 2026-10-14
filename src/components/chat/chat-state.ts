import type { UIMessage } from "@convex-dev/agent/react";

/** True from the moment the voter sends until an answer follows their question. */
export function awaitingAnswer(ui: readonly UIMessage[], pendingEcho: string | null): boolean {
  return pendingEcho !== null || ui.at(-1)?.role === "user";
}

const STAMP = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });

/** "Oct 14": the day an answer was given, in Wisconsin time. */
export function answerStamp(ms: number): string {
  return STAMP.format(ms);
}

/** Whether the voter has scrolled far enough above the newest message to need a way back. */
export function farFromLatest(el: { scrollTop: number; clientHeight: number; scrollHeight: number }): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight > 160;
}
