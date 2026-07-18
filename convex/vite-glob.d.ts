// import.meta.glob is provided by vitest's vite runtime in *.test.ts files.
interface ImportMeta {
  glob: (
    patterns: string | string[],
  ) => Record<string, () => Promise<unknown>>;
}
