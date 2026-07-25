/** Shown on Spanish pages whose content is machine-translated and NOT
 * human-verified (Phase 2 data pages). Hand-verified pages (e.g. /es/vote)
 * omit it. Direct quotes always stay in English regardless. */
export function MachineTranslated() {
  return (
    <div
      lang="es"
      className="border-2 border-border bg-warning px-4 py-2 text-sm font-bold"
    >
      Traducción automática — el texto original está en inglés. Para trámites,
      confíe en las fuentes oficiales enlazadas.
    </div>
  );
}
