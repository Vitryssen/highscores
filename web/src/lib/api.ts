import type { Game } from '@shared/types.ts';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase.ts';

export interface PuzzleResult {
  run_id: string;
  game_id: string;
  player_id: string;
  player_name: string;
  puzzle: number;
  score: number | null;
  failed: boolean;
  raw_paste: string;
  submitted_at: string;
  place: number;
  points: number;
}

export interface Standing {
  game_id: string;
  player_id: string;
  player_name: string;
  points: number;
  runs: number;
  wins: number;
  avg_place: number;
}

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const fetchGames = () =>
  rows<Game>(supabase.from('games').select('*').eq('active', true).order('name'));

export const fetchPlayerNames = async () =>
  (await rows<{ name: string }>(supabase.from('players').select('name').order('name').limit(500))).map(
    (p) => p.name,
  );

export const fetchPuzzle = (gameId: string, puzzle: number) =>
  rows<PuzzleResult>(
    supabase.from('puzzle_results').select('*').eq('game_id', gameId).eq('puzzle', puzzle).order('place'),
  );

export const fetchStandings = (gameId: string) =>
  rows<Standing>(
    supabase
      .from('alltime_standings')
      .select('*')
      .eq('game_id', gameId)
      .order('points', { ascending: false })
      .order('wins', { ascending: false })
      .limit(100),
  );

/** Winner of each recent puzzle, newest first. */
export const fetchHistory = (gameId: string) =>
  rows<PuzzleResult>(
    supabase
      .from('puzzle_results')
      .select('*')
      .eq('game_id', gameId)
      .eq('place', 1)
      .order('puzzle', { ascending: false })
      .limit(30),
  );

export interface SubmitSuccess {
  run_id: string;
  game: { id: string; slug: string; name: string };
  player_name: string;
  puzzle: number;
  score: number | null;
  failed: boolean;
  place: number;
  points: number;
}

export class SubmitError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly candidates: { id: string; slug: string; name: string }[] = [],
  ) {
    super(message);
  }
}

export async function submitRun(
  body: {
    game_id?: string;
    player_name: string;
    paste: string;
    override?: { puzzle?: number; submitted_at?: string };
  },
  /** Admin access token, required for backfill overrides. */
  accessToken?: string,
): Promise<SubmitSuccess> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/submit-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SubmitError('Network error. Check your connection and try again.', 'network');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    throw new SubmitError(err?.message ?? 'Something went wrong.', err?.code ?? 'server_error', err?.candidates);
  }
  return json as SubmitSuccess;
}
