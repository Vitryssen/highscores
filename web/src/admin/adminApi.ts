import type { Game } from '@shared/types.ts';
import { supabase } from '../lib/supabase.ts';
import type { PuzzleResult } from '../lib/api.ts';

// Admin writes go straight to the tables. RLS only allows them for an MFA-verified admin.

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export type GameRow = Omit<Game, 'id' | 'created_at'>;

export const fetchAllGames = async () =>
  check(await supabase.from('games').select('*').order('name')) as Game[];

export async function saveGame(row: GameRow, id?: string): Promise<Game> {
  const query = id
    ? supabase.from('games').update(row).eq('id', id).select().single()
    : supabase.from('games').insert(row).select().single();
  return check(await query) as Game;
}

export async function deleteGame(id: string): Promise<void> {
  check(await supabase.from('games').delete().eq('id', id));
}

export interface RunFilters {
  gameId?: string;
  player?: string;
  puzzle?: number;
  since?: string; // ISO timestamp
}

export async function fetchRuns(f: RunFilters): Promise<PuzzleResult[]> {
  let q = supabase.from('puzzle_results').select('*').order('submitted_at', { ascending: false }).limit(200);
  if (f.gameId) q = q.eq('game_id', f.gameId);
  if (f.player) q = q.ilike('player_name', `%${f.player.replace(/[\\%_]/g, '\\$&')}%`);
  if (f.puzzle !== undefined) q = q.eq('puzzle', f.puzzle);
  if (f.since) q = q.gte('submitted_at', f.since);
  return check(await q) as PuzzleResult[];
}

export async function updateRun(id: string, patch: { puzzle: number; score: number | null; failed: boolean }) {
  check(await supabase.from('runs').update(patch).eq('id', id));
}

export async function deleteRuns(ids: string[]): Promise<void> {
  if (ids.length) check(await supabase.from('runs').delete().in('id', ids));
}

export interface PlayerRow {
  id: string;
  name: string;
  created_at: string;
  runs: { count: number }[];
}

export const fetchPlayers = async () =>
  check(await supabase.from('players').select('id, name, created_at, runs(count)').order('name')) as PlayerRow[];

export async function renamePlayer(id: string, name: string): Promise<void> {
  check(await supabase.from('players').update({ name }).eq('id', id));
}

export async function deletePlayer(id: string): Promise<void> {
  check(await supabase.from('players').delete().eq('id', id));
}
