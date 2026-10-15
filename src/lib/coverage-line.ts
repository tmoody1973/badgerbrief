/** The finance card's period line. State labels arrive as "filings through
 * Sep 23, 2026", federal ones as a range; the card used to prefix "through"
 * to both, which read "through filings through …". */
export function coverageLine(label: string): string {
  if (/\bthrough\b/i.test(label)) return label.charAt(0).toUpperCase() + label.slice(1);
  return `Covers ${label}`;
}
