import type { Game } from '@shared/types.ts';
import { puzzleDate } from '@shared/puzzleDate.ts';

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

/** "#1922" for numbered games, "Wed 23 Sep" for date games. */
export function puzzleLabel(game: Game, puzzle: number): string {
  return game.puzzle_source === 'paste' ? `#${puzzle.toLocaleString('en-US')}` : formatDay(puzzleDate(game, puzzle));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
