// Which puzzle is "today" for a game, given its reset time and timezone.
// All dates are plain YYYY-MM-DD strings to avoid host-timezone surprises.

import type { GameConfig } from './types.ts';

type DateConfig = Pick<
  GameConfig,
  'puzzle_source' | 'anchor_puzzle' | 'anchor_date' | 'reset_time' | 'timezone'
>;

const DAY_MS = 86_400_000;

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** The calendar day the game considers current at `at`, accounting for its reset time. */
export function gameDay(game: DateConfig, at: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: game.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const [resetH, resetM] = game.reset_time.split(':').map(Number);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes < resetH * 60 + resetM ? addDays(day, -1) : day;
}

function basePuzzle(game: DateConfig): number {
  return game.puzzle_source === 'paste' ? (game.anchor_puzzle ?? 0) : 1;
}

/** Today's puzzle number (paste games) or 1-based day index (date games). */
export function currentPuzzle(game: DateConfig, at: Date = new Date()): number {
  return basePuzzle(game) + daysBetween(game.anchor_date, gameDay(game, at));
}

/** The calendar day a puzzle belongs to. */
export function puzzleDate(game: DateConfig, puzzle: number): string {
  return addDays(game.anchor_date, puzzle - basePuzzle(game));
}

/** Players may submit today's or yesterday's puzzle. Admins can backfill anything. */
export function isPuzzleInWindow(game: DateConfig, puzzle: number, at: Date = new Date()): boolean {
  const today = currentPuzzle(game, at);
  return puzzle === today || puzzle === today - 1;
}
