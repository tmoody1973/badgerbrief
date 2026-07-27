"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CONTRIBUTE_KINDS, parseContributeKind, type ContributeKind } from "@/lib/contribute-kind";

const field = "mt-1 w-full border-2 border-border bg-card px-3 py-2 text-sm";
const label = "font-mono text-[11px] font-bold uppercase tracking-[0.1em]";

/** Slug only — this is shown back to the visitor and read off the URL, so it's
 * never trusted as HTML or as a link target. */
function sanitizeRef(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return cleaned || undefined;
}

export function ContributeForm() {
  const searchParams = useSearchParams();
  const submit = useMutation(api.feedback.submit);
  const ref = sanitizeRef(searchParams.get("ref"));
  const [kind, setKind] = useState<ContributeKind>(() => parseContributeKind(searchParams.get("kind")));
  const [message, setMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string }>({
    kind: "idle",
  });

  if (state.kind === "sent") {
    return (
      <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
        <p className="font-display text-xl">Thanks — that&rsquo;s been logged.</p>
        <p className="mt-2 max-w-[54ch] text-sm">
          A person reads every submission before anything changes on the site.
          If you left a way to reach you, you&rsquo;ll hear back once it&rsquo;s
          been looked at.
        </p>
      </div>
    );
  }

  const active = CONTRIBUTE_KINDS.find((k) => k.kind === kind)!;
  const needsSource = active.needs.includes("source");
  const needsContact = active.needs.includes("contact");

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
            // window.location.href already carries ?kind/?ref, so admin
            // context is preserved without fabricating a route from `ref`.
            pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
            website: website || undefined,
          });
          setState({ kind: "sent" });
        } catch (err) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Something went wrong — please try again.",
          });
        }
      }}
    >
      {ref && <p className={`${label} text-muted-foreground`}>re: {ref}</p>}

      <div className={ref ? "mt-3" : undefined}>
        <label className={label} htmlFor="ctb-kind">
          What kind of contribution?
        </label>
        <select
          id="ctb-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ContributeKind)}
          className={field}
        >
          {CONTRIBUTE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label className={label} htmlFor="ctb-message">
          Details
        </label>
        <textarea
          id="ctb-message"
          required
          minLength={10}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you'd like to contribute."
          className={field}
        />
      </div>

      {needsSource && (
        <div className="mt-3">
          <label className={label} htmlFor="ctb-source">
            Link to the source <span className="font-normal normal-case">(required)</span>
          </label>
          <input
            id="ctb-source"
            type="url"
            required
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            className={field}
          />
        </div>
      )}

      {needsContact && (
        <div className="mt-3">
          <label className={label} htmlFor="ctb-contact">
            Email <span className="font-normal normal-case">(required)</span>
          </label>
          <input
            id="ctb-contact"
            type="email"
            required
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="So we can follow up"
            className={field}
          />
        </div>
      )}

      {/* Honeypot: hidden from people, filled by scripted submitters. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="ctb-website">Website</label>
        <input
          id="ctb-website"
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
