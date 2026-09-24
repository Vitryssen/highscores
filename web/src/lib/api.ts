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
  puzzle_date: string;
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
      .eq('failed', false) // a puzzle where everyone failed has no winner
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
    readonly game?: { slug: string; name: string },
  ) {
    super(message);
  }
}

/** POST to an Edge Function. Errors come back as SubmitError with the function's error code. */
async function callFunction<T>(name: string, body: unknown, accessToken?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
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
    throw new SubmitError(err?.message ?? 'Something went wrong.', err?.code ?? 'server_error', err?.candidates, err?.game);
  }
  return json as T;
}

export const submitRun = (
  body: {
    game_id?: string;
    player_name: string;
    paste: string;
    override?: { puzzle?: number; submitted_at?: string };
  },
  /** Admin access token, required for backfill overrides. */
  accessToken?: string,
) => callFunction<SubmitSuccess>('submit-run', body, accessToken);

export type RequestStatus = 'pending' | 'added' | 'declined';

export interface GameRequest {
  id: string;
  name: string;
  requested_by: string | null;
  status: RequestStatus;
  decline_reason: string | null;
  game_id: string | null;
  votes: number;
  created_at: string;
  resolved_at: string | null;
}

export const REQUEST_COLUMNS = 'id, name, requested_by, status, decline_reason, game_id, votes, created_at, resolved_at';

/** Pending requests first (most wanted on top), then recently resolved ones. */
export const fetchGameRequests = async () =>
  (
    await rows<GameRequest>(
      supabase.from('game_requests').select(REQUEST_COLUMNS).order('created_at', { ascending: false }).limit(200),
    )
  ).sort(
    (a, b) =>
      Number(b.status === 'pending') - Number(a.status === 'pending') ||
      (a.status === 'pending' ? b.votes - a.votes : 0) ||
      (b.resolved_at ?? b.created_at).localeCompare(a.resolved_at ?? a.created_at),
  );

export interface RequestSuccess {
  request_id: string;
  name: string;
  outcome: 'created' | 'voted' | 'already_voted';
}

export const requestGame = (body: { name: string; url: string; paste: string; requested_by?: string; note?: string }) =>
  callFunction<RequestSuccess>('request-game', body);

export interface GrandPrixRow {
  month: string; // YYYY-MM-01
  player_id: string;
  player_name: string;
  points: number;
  runs: number;
  wins: number;
  games: number;
}

export type GrandPrixGameRow = Omit<GrandPrixRow, 'games'> & { game_id: string };

/** Every month's Grand Prix points per game and player, for totalling any set of games. */
export const fetchGrandPrixByGame = () =>
  rows<GrandPrixGameRow>(
    supabase.from('grand_prix_game_monthly').select('*').order('month', { ascending: false }).limit(1000),
  );

/** Results for the given puzzles, one per game: today's Grand Prix. */
export const fetchPuzzleResults = (puzzles: { game_id: string; puzzle: number }[]) =>
  rows<PuzzleResult>(
    supabase
      .from('puzzle_results')
      .select('*')
      .or(puzzles.map((p) => `and(game_id.eq.${p.game_id},puzzle.eq.${p.puzzle})`).join(','))
      .limit(1000),
  );

export interface Streak {
  game_id: string;
  player_id: string;
  player_name: string;
  current_play_streak: number;
  best_play_streak: number;
  current_win_streak: number;
  best_win_streak: number;
}

export const fetchStreaks = (gameId?: string) => {
  const q = supabase.from('streaks').select('*').limit(500);
  return rows<Streak>(gameId ? q.eq('game_id', gameId) : q);
};

export async function fetchPlayerByName(name: string): Promise<{ id: string; name: string } | null> {
  // Case-insensitive exact match, with LIKE wildcards escaped.
  const list = await rows<{ id: string; name: string }>(
    supabase.from('players').select('id, name').ilike('name', name.replace(/[\\%_]/g, '\\$&')).limit(1),
  );
  return list[0] ?? null;
}

/** Every player's all-time standing in every game, for per-game ranks on profiles. */
export const fetchAllStandings = () =>
  rows<Standing>(supabase.from('alltime_standings').select('*').order('points', { ascending: false }).limit(500));

export const RUNS_PAGE_SIZE = 10;

/** One page of a player's runs, newest first, plus the total count for pagination. */
export async function fetchPlayerRuns(playerId: string, page: number): Promise<{ runs: PuzzleResult[]; total: number }> {
  const from = page * RUNS_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from('puzzle_results')
    .select('*', { count: 'exact' })
    .eq('player_id', playerId)
    .order('submitted_at', { ascending: false })
    .order('run_id')
    .range(from, from + RUNS_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { runs: (data ?? []) as PuzzleResult[], total: count ?? 0 };
}
