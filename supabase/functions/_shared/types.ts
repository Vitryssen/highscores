// Mirrors a row of public.games. Shared by the web app and the Edge Function.

export type ScoreType = 'guesses' | 'number' | 'tiers' | 'time';
export type PuzzleSource = 'paste' | 'date';

export interface GameConfig {
  score_type: ScoreType;
  higher_is_better: boolean;
  max_guesses: number | null;
  tiers: string[] | null;
  min_score: number | null; // optional limits; scores outside are rejected
  max_score: number | null;
  parse_regex: string;
  // Optional: sum every (?<score>…) match of this regex instead of reading one score.
  score_regex: string | null;
  score_count: number | null; // with score_regex: exact number of matches required
  regex_flags: string;
  puzzle_source: PuzzleSource;
  anchor_puzzle: number | null;
  anchor_date: string; // YYYY-MM-DD
  reset_time: string; // HH:MM or HH:MM:SS
  timezone: string; // IANA name
}

export interface Game extends GameConfig {
  id: string;
  slug: string;
  name: string;
  url: string | null;
  sample_pastes: string[];
  active: boolean;
  created_at: string;
}

export const MAX_PASTE_LENGTH = 2000;
export const MAX_NAME_LENGTH = 32;
