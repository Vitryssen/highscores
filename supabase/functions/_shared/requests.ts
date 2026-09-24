// Game request limits and URL matching. Shared by the web form and the `request-game` function.

export const MAX_REQUEST_NAME = 60;
export const MAX_REQUEST_URL = 300;
export const MAX_REQUEST_NOTE = 300;
export const MAX_DECLINE_REASON = 200;

/**
 * The part of a game link that identifies the game: host and path, lowercased, without
 * `www.`, a trailing index file or slashes, the query or the fragment. Two links with the same
 * key count as the same request. Returns null for anything that isn't an https URL.
 */
export function urlKey(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname
    .toLowerCase()
    .replace(/\/index\.(html?|php)$/, '')
    .replace(/\/+$/, '');
  return host + path;
}
