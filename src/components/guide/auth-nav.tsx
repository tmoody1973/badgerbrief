"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

/**
 * Sign-in affordance for the site chrome (MOO-332). Before this the site had
 * no auth UI at all: signed-out visitors hit gated nav items with no
 * explanation, and signed-in users had no way to sign out.
 *
 * Uses useUser rather than <SignedIn>/<SignedOut> — Clerk v7 replaced those
 * with <Show>, and the hook is the stable surface across both.
 */
export function AuthNav() {
  const { isLoaded, isSignedIn } = useUser();

  // Render nothing until Clerk resolves, so the button doesn't flash the
  // wrong state on first paint.
  if (!isLoaded) return <div className="h-7 w-7" aria-hidden />;

  if (isSignedIn) {
    return (
      <UserButton
        appearance={{ elements: { avatarBox: "h-7 w-7 border-2 border-border" } }}
      />
    );
  }

  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className="press whitespace-nowrap border-2 border-border bg-card px-2 py-1 font-mono text-sm font-bold uppercase tracking-wider shadow-[var(--shadow-brutal)]"
      >
        Sign in
      </button>
    </SignInButton>
  );
}
