"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The audio player that sits under every debate quote.
 *
 * It exists for a specific reason, not for polish. Diarization on this
 * recording is uneven — one candidate's words averaged 0.50 speaker
 * confidence across the full hour. A printed quote asks the reader to trust
 * our attribution; ten seconds of tape lets them check it. So the clip is
 * evidence, and it is placed next to the claim rather than behind a link.
 *
 * Only one clip plays at a time. Two candidates talking over each other out of
 * a phone speaker is not a comparison, it's noise.
 */

/** The element currently playing, shared across every instance on the page. */
let nowPlaying: HTMLAudioElement | null = null;

function stopOthers(except: HTMLAudioElement) {
  if (nowPlaying && nowPlaying !== except) {
    nowPlaying.pause();
    nowPlaying.currentTime = 0;
  }
  nowPlaying = except;
}

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function DebateClip({
  src,
  label,
  atSec,
}: {
  src: string;
  /** Whose words these are — announced to screen readers, which can't see the card. */
  label: string;
  /** Where the excerpt sits in the full programme, shown as a record stamp. */
  atSec: number;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onEnd = () => {
      setPlaying(false);
      setElapsed(0);
    };
    const onTime = () => setElapsed(el.currentTime);
    const onMeta = () => setTotal(el.duration);
    const onPause = () => setPlaying(false);
    el.addEventListener("ended", onEnd);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("pause", onPause);
      if (nowPlaying === el) nowPlaying = null;
    };
  }, []);

  async function toggle() {
    const el = ref.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    stopOthers(el);
    try {
      await el.play();
      setPlaying(true);
    } catch {
      // Autoplay policy or a missing file: leave the control in its resting
      // state rather than showing a spinner that never resolves.
      setPlaying(false);
    }
  }

  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      {/* preload="none" — 40 clips on one page must not cost 40 requests on load. */}
      <audio ref={ref} src={src} preload="none" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${label}` : `Play ${label} saying this`}
        className="press flex h-9 w-9 shrink-0 items-center justify-center border-2 border-border bg-card shadow-[var(--shadow-brutal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      >
        {playing ? (
          <svg viewBox="0 0 12 14" className="h-3.5 w-3.5" aria-hidden="true">
            <rect x="0" y="0" width="4" height="14" fill="currentColor" />
            <rect x="8" y="0" width="4" height="14" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 14" className="h-3.5 w-3.5" aria-hidden="true">
            <polygon points="0,0 12,7 0,14" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="h-2 w-full border-2 border-border bg-background"
          role="presentation"
        >
          <div
            className="h-full bg-foreground"
            style={{ width: `${pct}%`, transition: "width 120ms linear" }}
          />
        </div>
      </div>

      <span className="shrink-0 font-mono text-[11px] font-bold tracking-[0.08em] text-muted-foreground">
        {playing || elapsed > 0 ? mmss(elapsed) : mmss(atSec)}
      </span>
    </div>
  );
}
