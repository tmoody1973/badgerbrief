/**
 * One plain-text email to the editor, through Resend. Uses the same settings
 * and the same inbox as the feedback notice in convex/feedback.ts, which
 * predates this helper and is left as it is.
 *
 * Never throws: every caller has already recorded what it is writing about.
 */
export async function emailEditor(subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false; // email off: the admin page still has it
  const from = process.env.RESEND_FROM ?? "BadgerBrief <onboarding@resend.dev>";
  const to = process.env.FEEDBACK_NOTIFY_TO ?? "tarikjmoody@gmail.com";
  // Two tries: the caller files each warning once, so a notice lost here is
  // not sent again tomorrow.
  for (const attempt of [1, 2]) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return true;
      console.error(`notify: Resend refused "${subject}" (${res.status}, try ${attempt}): ${(await res.text()).slice(0, 300)}`);
      if (res.status < 500) return false; // our request is wrong; sending it again will not help
    } catch (error) {
      console.error(`notify: could not send "${subject}" (try ${attempt}): ${String(error)}`);
    }
  }
  return false;
}
