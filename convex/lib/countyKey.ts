/**
 * One key for a Wisconsin county however it is written: the state's
 * "ST. CROIX COUNTY", the Census lookup's "St. Croix", a link's "st-croix".
 * scripts/lib/wec-county.mjs has the same rule for the build script; a test
 * in ballotExtras.test.ts holds the two together.
 */
export const countyKey = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+county$/, "")
    .replace(/\./g, "")
    .replace(/\s+/g, "-");
