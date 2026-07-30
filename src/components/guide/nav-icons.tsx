/**
 * Bottom-tab icons, sourced from i0 (icons0.dev) to match the neo-brutalist
 * chrome. Each uses `currentColor`, so the active tab's `text-primary` and the
 * light/dark theme flow through with no per-icon color handling. `aria-hidden`
 * because the tab's text label is the accessible name.
 */
type IconProps = { className?: string };

export function IconHome({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M3 13h1v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7h1a1 1 0 0 0 .707-1.707l-9-9a1 1 0 0 0-1.414 0l-9 9A1 1 0 0 0 3 13m7 7v-5h4v5zm2-15.586l6 6V15l.001 5H16v-5c0-1.103-.897-2-2-2h-4c-1.103 0-2 .897-2 2v5H6v-9.586z"
      />
    </svg>
  );
}

export function IconRaces({ className }: IconProps) {
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 3.77A1.604 1.604 0 1 0 7 .564A1.604 1.604 0 0 0 7 3.77M1.959 6.979H12.04m-9.165 0l.459 6.416m7.791-6.416l-.459 6.416M7 8.59l.59 1.195l1.318.192l-.954.93l.225 1.313L7 11.6l-1.18.62l.226-1.313l-.954-.93l1.318-.192zM10 7a3 3 0 0 0-6 0"
      />
    </svg>
  );
}

export function IconVote({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M18 13h-.68l-2 2h1.91L19 17H5l1.78-2h2.05l-2-2H6l-3 3v6h18v-6zm1.81-5.04L13.45 1.6L5.68 9.36l6.36 6.36zm-6.35-3.55L17 7.95l-4.95 4.95l-3.54-3.54z"
      />
    </svg>
  );
}

export function IconChat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 26 26" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M10 0C4.547 0 0 3.75 0 8.5c0 2.43 1.33 4.548 3.219 6.094a4.8 4.8 0 0 1-.969 2.25a14 14 0 0 1-.656.781a2.5 2.5 0 0 0-.313.406c-.057.093-.146.197-.187.407s.015.553.187.812l.125.219l.25.125c.875.437 1.82.36 2.688.125c.867-.236 1.701-.64 2.5-1.063S8.401 17.792 9 17.469c.084-.045.138-.056.219-.094C10.796 19.543 13.684 21 16.906 21c.031.004.06 0 .094 0c1.3 0 5.5 4.294 8 2.594c.1-.399-2.198-1.4-2.313-4.375c1.957-1.383 3.22-3.44 3.22-5.719c0-3.372-2.676-6.158-6.25-7.156C18.526 2.664 14.594 0 10 0m0 2c4.547 0 8 3.05 8 6.5S14.547 15 10 15c-.812 0-1.278.332-1.938.688s-1.417.796-2.156 1.187c-.64.338-1.25.598-1.812.781c.547-.79 1.118-1.829 1.218-3.281l.032-.563l-.469-.343C3.093 12.22 2 10.423 2 8.5C2 5.05 5.453 2 10 2"
      />
    </svg>
  );
}

// No i0 pick for "More" yet — a matching bold dots glyph as a stand-in.
export function IconMore({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}
