import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { VoterHelpChat } from "@/components/chat/voter-help-chat";

export const metadata: Metadata = {
  title: "Voter Help",
  robots: { index: false }, // per-visitor conversation, not shareable/indexable content
};

// The typing box sits at the bottom of the screen: let the on-screen keyboard
// shrink the page (Chromium) instead of covering the box. iOS ignores this.
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default function ChatPage() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4">
      {/* The chat reads ?q= from the link; Suspense keeps the page itself static. */}
      <Suspense>
        <VoterHelpChat />
      </Suspense>
    </main>
  );
}
