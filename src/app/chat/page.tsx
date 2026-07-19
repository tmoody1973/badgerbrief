import type { Metadata } from "next";
import { VoterHelpChat } from "@/components/chat/voter-help-chat";

export const metadata: Metadata = {
  title: "Voter Help",
  robots: { index: false }, // personal, Clerk-gated
};

export default function ChatPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <VoterHelpChat />
    </main>
  );
}
