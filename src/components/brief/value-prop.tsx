"use client";

import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { track } from "@/lib/analytics";

/**
 * Value-first screen for signed-out visitors (MOO-332). /brief used to be
 * middleware-gated, so a voter clicking "My Brief" was bounced straight to a
 * Clerk sign-in on an unfamiliar domain with no explanation. Now the page
 * renders, they see a real sample brief below this card, and the account is
 * explained before it is asked for.
 *
 * Every claim here maps to a shipped feature in PreferencesPanel — address →
 * districts, starred races, saved issues, detail level.
 */
export function BriefValueProp() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded || isSignedIn) return null;

  return (
    <section className="mb-8 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Free account
      </p>
      <h1 className="font-display mt-1 text-2xl leading-tight sm:text-3xl">
        Your ballot, not everyone&apos;s.
      </h1>
      <p className="mt-2 max-w-[54ch]">
        Wisconsin&apos;s Aug 11 primary ballot is different on every block. A
        free BadgerBrief account turns this guide into just the part that
        applies to you.
      </p>
      <ul className="mt-4 space-y-2">
        {[
          "Enter your address once — we look up your congressional, senate, and assembly districts and show only the races you can actually vote in.",
          "Star the races you care about and pick the issues you want covered.",
          "Get a personalized brief at the level of detail you choose, with every claim linked to its source.",
        ].map((line) => (
          <li
            key={line}
            className="max-w-[60ch] border-2 border-border bg-secondary p-2 text-sm font-medium"
          >
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <SignUpButton mode="modal">
          <button
            type="button"
            onClick={() => track("auth_start", { intent: "sign_up", from: "brief" })}
            className="press border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)]"
          >
            Create a free account
          </button>
        </SignUpButton>
        <SignInButton mode="modal">
          <button
            type="button"
            className="press border-2 border-border bg-card px-4 py-2 font-bold shadow-[var(--shadow-brutal)]"
          >
            Sign in
          </button>
        </SignInButton>
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        We never make endorsements. Your address is used to find your districts
        and is not shared.
      </p>
      <p className="mt-4 border-t-2 border-dashed border-border pt-3 text-sm text-muted-foreground">
        Below is a sample brief so you can see the format before signing up.
      </p>
    </section>
  );
}
