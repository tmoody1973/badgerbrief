"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { track } from "@/lib/analytics";
import { ConvexError } from "convex/values";
import {
  toUIMessages,
  useSmoothText,
  useThreadMessages,
  type UIMessage,
} from "@convex-dev/agent/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/retroui/Button";

/** MOO-310 Voter Help chat — one persistent thread per signed-in user. */

const EXAMPLES = [
  "When's the deadline to register?",
  "Who's on my ballot?",
  "How do I vote absentee?",
];

function asMessage(err: unknown): string {
  // ConvexError data survives to prod clients; plain Error messages are redacted there.
  if (err instanceof ConvexError) return String(err.data);
  return err instanceof Error ? err.message : String(err);
}

const GUEST_ID_KEY = "bb_guest_id";

/** Read the guest id from localStorage, creating one if absent. Client-only —
 * call from an effect, never during render/SSR. */
export function getOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(GUEST_ID_KEY, created);
  return created;
}

/**
 * Args for a query that behaves differently signed-in vs guest: `extra` alone
 * once authenticated, `extra` + guestId once we have one, else "skip" until
 * the guest id exists (never fire a guest call with an undefined guestId).
 */
export function guestArgs<T extends Record<string, unknown>>(
  isAuthenticated: boolean,
  guestId: string | null,
  extra: T = {} as T,
): T | (T & { guestId: string }) | "skip" {
  if (isAuthenticated) return extra;
  if (!guestId) return "skip";
  return { ...extra, guestId };
}

/**
 * Is this a link to an interview clip in OUR OWN Convex storage?
 *
 * Deliberately strict. The agent chooses what to link, so this decides whether
 * model output gets rendered as an embedded player — it must be impossible to
 * make the chat embed an arbitrary URL. Only our exact storage origin and path
 * qualify; anything else stays an ordinary link.
 */
function isOwnClipUrl(href?: string): href is string {
  if (!href) return false;
  const base = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!base) return false;
  try {
    const url = new URL(href);
    const ours = new URL(base);
    return (
      url.protocol === "https:" &&
      url.host === ours.host &&
      url.pathname.startsWith("/api/storage/")
    );
  } catch {
    return false;
  }
}

/** Assistant markdown → styled elements. react-markdown renders NO raw HTML by
 * default, so LLM output can't inject markup; links open safely in a new tab. */
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) =>
    isOwnClipUrl(href) ? (
      <video
        controls
        preload="metadata"
        playsInline
        src={`${href}#t=0.5`}
        className="my-2 w-full max-w-[380px] border-2 border-border bg-black"
      />
    ) : (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-2 underline-offset-2"
      >
        {children}
      </a>
    ),
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  h1: ({ children }) => <h3 className="mb-1 font-display text-base">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 font-display text-base">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1 font-display text-base">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 font-bold">{children}</h4>,
  code: ({ children }) => (
    <code className="bg-secondary px-1 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto border-2 border-border bg-secondary p-2 font-mono text-xs last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-3 italic last:mb-0">
      {children}
    </blockquote>
  ),
};

export function MdText({ text }: { text: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function AssistantBubble({ message }: { message: UIMessage }) {
  const [visibleText] = useSmoothText(message.text, {
    startStreaming: message.status === "streaming",
  });
  return (
    <div className="max-w-[85%] border-2 border-border bg-card p-3 text-sm shadow-[var(--shadow-brutal)]">
      <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Voter Help
      </p>
      <MdText text={visibleText} />
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="ml-auto max-w-[85%] border-2 border-border bg-secondary p-3 text-sm">
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}

export function VoterHelpChat() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  // Guest id: created client-side only, once we know the visitor isn't
  // signing in. Never read/written during render — SSR has no localStorage.
  const [guestId, setGuestId] = useState<string | null>(null);
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    setGuestId(getOrCreateGuestId());
  }, [isLoading, isAuthenticated]);

  const serverThreadId = useQuery(
    api.voterHelpQueries.getMyThread,
    guestArgs(isAuthenticated, guestId),
  );
  const [localThreadId, setLocalThreadId] = useState<string | null>(null);
  const threadId = localThreadId ?? serverThreadId ?? null;

  const messages = useThreadMessages(
    api.voterHelpQueries.listThreadMessages,
    threadId ? guestArgs(isAuthenticated, guestId, { threadId }) : "skip",
    { initialNumItems: 50, stream: true },
  );
  const sendMessage = useMutation(api.voterHelpQueries.sendMessage);

  const [draft, setDraft] = useState("");
  const [pendingEcho, setPendingEcho] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ui = toUIMessages(messages.results ?? []).filter(
    (m) => m.role === "user" || m.text.trim().length > 0,
  );

  // Drop the local echo once the server row for it exists.
  useEffect(() => {
    if (pendingEcho && ui.some((m) => m.role === "user" && m.text === pendingEcho)) {
      setPendingEcho(null);
    }
  }, [ui, pendingEcho]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [ui.length, pendingEcho]);

  const send = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (!isAuthenticated && !guestId) {
      setError("Reload and try again.");
      return;
    }
    setError(null);
    setPendingEcho(trimmed);
    setDraft("");
    try {
      track("voter_help_ask"); // deliberately no properties — the prompt may contain PII
      const { threadId: tid } = await sendMessage(
        isAuthenticated ? { prompt: trimmed } : { prompt: trimmed, guestId: guestId! },
      );
      setLocalThreadId(tid);
      track("voter_help_answered", { ok: true });
    } catch (err) {
      setPendingEcho(null);
      setDraft(trimmed);
      track("voter_help_answered", { ok: false });
      setError(asMessage(err));
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  if (isLoading) return null;
  const canSend = isAuthenticated || guestId !== null;

  return (
    <div className="flex min-h-[60vh] flex-col">
      <h1 className="font-display text-3xl">Voter Help</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Practical voting questions, answered from published data and official
        sources — with citations, no endorsements, no legal advice.
      </p>

      <div className="mt-6 flex flex-1 flex-col gap-3">
        {ui.length === 0 && !pendingEcho && (
          <div className="border-2 border-dashed border-border p-4 text-sm">
            <p className="font-bold">Try asking:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="border-2 border-border bg-card px-2 py-1 hover:bg-secondary"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {ui.map((m) =>
          m.role === "user" ? (
            <UserBubble key={m.key} text={m.text} />
          ) : (
            <AssistantBubble key={m.key} message={m} />
          ),
        )}
        {pendingEcho && <UserBubble text={pendingEcho} />}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="mt-3 border-2 border-border bg-warning p-2 text-sm font-bold">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a voting question…"
          aria-label="Ask a voting question"
          className="min-w-0 flex-1 border-2 border-border bg-background p-2"
          maxLength={2000}
        />
        <Button type="submit" variant="primary" disabled={!draft.trim() || !canSend}>
          Send
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        For official actions (registering, absentee, polling place), MyVote
        Wisconsin is always the authoritative source.
        {!isAuthenticated && " Sign in to save this conversation across devices."}
      </p>
    </div>
  );
}
