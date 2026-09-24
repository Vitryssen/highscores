import { useState } from 'react';
import type { Game } from '@shared/types.ts';
import type { GrandPrixGameRow, GrandPrixRow } from './api.ts';
import { load, save } from './storage.ts';

const GAMES_KEY = 'highscores:gp-games';

/** Games the Grand Prix totals until a viewer picks their own. */
export const DEFAULT_GP_GAMES = ['wordle', 'ordel', 'rngdle'];

function loadSlugs(): string[] {
  try {
    const v: unknown = JSON.parse(load(GAMES_KEY) ?? 'null');
    if (Array.isArray(v) && v.length && v.every((s) => typeof s === 'string')) return v;
  } catch {
    // Fall back to the default.
  }
  return DEFAULT_GP_GAMES;
}

/** The viewer's chosen Grand Prix games (as slugs), remembered in this browser. */
export function useGrandPrixGames(): [string[], (slugs: string[]) => void] {
  const [slugs, setSlugs] = useState(loadSlugs);
  return [
    slugs,
    (next) => {
      setSlugs(next);
      save(GAMES_KEY, JSON.stringify(next));
    },
  ];
}

/** Totals per month and player over the chosen games, best first within each month, newest month first. */
export function totalGrandPrix(rows: GrandPrixGameRow[], games: Game[], slugs: string[]): GrandPrixRow[] {
  const ids = new Set(games.filter((g) => slugs.includes(g.slug)).map((g) => g.id));
  const totals = new Map<string, GrandPrixRow>();
  for (const r of rows) {
    if (!ids.has(r.game_id)) continue;
    const key = `${r.month}|${r.player_id}`;
    const t = totals.get(key);
    if (t) {
      t.points += r.points;
      t.runs += r.runs;
      t.wins += r.wins;
      t.games += 1;
    } else {
      totals.set(key, { month: r.month, player_id: r.player_id, player_name: r.player_name, points: r.points, runs: r.runs, wins: r.wins, games: 1 });
    }
  }
  return [...totals.values()].sort(
    (a, b) =>
      b.month.localeCompare(a.month) ||
      b.points - a.points ||
      b.wins - a.wins ||
      a.player_name.localeCompare(b.player_name),
  );
}

/** Champion of each finished month: most points, then most wins (rows arrive in that order). */
export function champions(rows: GrandPrixRow[], thisMonth: string): GrandPrixRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => r.month < thisMonth && !seen.has(r.month) && seen.add(r.month));
}
