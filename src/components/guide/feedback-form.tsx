"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";

/**
 * Reader corrections and questions.
 *
 * No sign-in, by design. The reconciliation gate is arithmetic against a
 * document's own numbers, and parseRollCall states what that cannot catch: an
 * internally-consistent page with two positions swapped. Nobody reviews a
 * parsed roll call before it reaches a real candidate's profile, so a reader is
 * the last check — and an auth wall would lose exactly the person most likely
 * to notice.
 *
 * A correction requires a source link. That is the same standard every claim on
 * the site is held to, applied to the people correcting it; it also filters
 * noise without turning away anyone who genuinely found a mistake.
 */
type Kind = "correction" | "question" | "other";

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "correction", label: "Something is wrong", hint: "A fact, vote, name, date or figure that doesn't match the record." },
  { value: "question", label: "I have a question", hint: "About the data, the sourcing, or how something was worked out." },
  { value: "other", label: "Something else", hint: "Anything that doesn't fit the other two." },
];

const field =
  "mt-1 w-full border-2 border-border bg-card px-3 py-2 text-sm";
const label =
  "font-mono text-[11px] font-bold uppercase tracking-[0.1em]";

export function FeedbackForm({ pageUrl }: { pageUrl?: string }) {
  const submit = useMutation(api.feedback.submit);
  const [kind, setKind] = useState<Kind>("correction");
  const [message, setMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string }>({ kind: "idle" });

  if (state.kind === "sent") {
    return (
      <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
        <p className="font-display text-xl">Thank you — that&rsquo;s been logged.</p>
        <p className="mt-2 max-w-[54ch] text-sm">
          Corrections are checked against the original source and, where we got
          it wrong, fixed. If you left a way to reach you, you&rsquo;ll hear back
          once it&rsquo;s been looked at.
        </p>
      </div>
    );
  }

  const active = KINDS.find((k) => k.value === kind)!;

  return (
    <form
      className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ kind: "sending" });
        try {
          await submit({
            kind,
            message,
            sourceUrl: sourceUrl || undefined,
            contact: contact || undefined,
            pageUrl: pageUrl ?? (typeof window !== "undefined" ? window.location.href : undefined),
            website: website || undefined,
          });
          setState({ kind: "sent" });
        } catch (err) {
          // Convex redacts a plain Error's message from the client in prod;
          // only ConvexError.data crosses the wire. The submit mutation throws
          // ConvexError for every user-facing validation, so read that first
          // and keep a generic fallback for genuine server faults.
          const message =
            err instanceof ConvexError
              ? String(err.data)
              : "Something went wrong — please try again.";
          setState({ kind: "error", message });
        }
      }}
    >
      <fieldset>
        <legend className={label}>What&rsquo;s this about?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              aria-pressed={kind === k.value}
              className={`border-2 border-border px-3 py-1.5 text-sm font-bold ${
                kind === k.value ? "bg-primary text-primary-foreground" : "bg-card"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{active.hint}</p>
      </fieldset>

      <div className="mt-4">
        <label className={label} htmlFor="fb-message">
          {kind === "correction" ? "What's wrong?" : "Your message"}
        </label>
        <textarea
          id="fb-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            kind === "correction"
              ? "Which page, which claim, and what the record actually says."
              : "Ask away."
          }
          className={field}
        />
      </div>

      {kind === "correction" && (
        <div className="mt-3">
          <label className={label} htmlFor="fb-source">
            Link to the source <span className="font-normal normal-case">(required)</span>
          </label>
          <input
            id="fb-source"
            type="url"
            required
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://docs.legis.wisconsin.gov/..."
            className={field}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Every claim on this site links to its source, so a correction needs
            one too — the official record, the roll call, the filing.
          </p>
        </div>
      )}

      <div className="mt-3">
        <label className={label} htmlFor="fb-contact">
          Email <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="fb-contact"
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Only if you want a reply"
          className={field}
        />
      </div>

      {/* Honeypot: hidden from people, filled by scripted submitters. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="fb-website">Website</label>
        <input
          id="fb-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {state.kind === "error" && (
        <p className="mt-3 border-2 border-border bg-warning px-3 py-2 text-sm">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={state.kind === "sending"}
        className="press mt-4 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] disabled:opacity-60"
      >
        {state.kind === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
