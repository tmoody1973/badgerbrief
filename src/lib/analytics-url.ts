/**
 * A page address with everything after the path removed: no "?query" and no
 * "#fragment".
 *
 * Every analytics tool on this site reports through this. People type home
 * addresses here, and a shared ballot carries districts after the "#", so
 * neither part of an address may ever be reported. Stripping only the "?"
 * was not enough: Vercel Web Analytics reports the whole address, "#" and all.
 */
export function pathOnlyUrl(address: string): string {
  try {
    const url = new URL(address);
    if (!url.search && !url.hash) return address;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    // Not a full address. Cut it by hand rather than pass it through whole.
    return address.split(/[?#]/)[0];
  }
}
