import { useState } from 'react';
import type { Game } from '@shared/types.ts';
import { load, save } from './storage.ts';

const ORDER_KEY = 'highscores:game-order';

function loadOrder(): string[] {
  try {
    const v: unknown = JSON.parse(load(ORDER_KEY) ?? 'null');
    if (Array.isArray(v) && v.every((s) => typeof s === 'string')) return v;
  } catch {
    // Fall back to the default order.
  }
  return [];
}

/** Sorts games by `slugs`; games not in it keep their order and go last. */
export function orderGames(games: Game[], slugs: string[]): Game[] {
  const rank = (g: Game) => {
    const i = slugs.indexOf(g.slug);
    return i < 0 ? slugs.length : i;
  };
  return [...games].sort((a, b) => rank(a) - rank(b)); // stable, so unknown games keep their order
}

/** The viewer's game card order, remembered in this browser like their name. */
export function useGameOrder(games: Game[]): [Game[], (ordered: Game[]) => void] {
  const [slugs, setSlugs] = useState(loadOrder);
  return [
    orderGames(games, slugs),
    (ordered) => {
      const next = ordered.map((g) => g.slug);
      setSlugs(next);
      save(ORDER_KEY, JSON.stringify(next));
    },
  ];
}
