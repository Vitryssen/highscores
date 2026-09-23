// localStorage can be missing or throw (private mode, blocked storage), so every access is
// guarded. It only holds conveniences like the last-used name.

export function load(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisting is fine.
  }
}
