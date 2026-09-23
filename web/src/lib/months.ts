const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2026-09-01" for the current month (Swedish time, where the group plays). */
export function currentMonth(now: Date = new Date()): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(now);
  return `${ymd.slice(0, 7)}-01`;
}

export function formatMonth(month: string): string {
  return monthFormat.format(new Date(`${month}T00:00:00Z`));
}
