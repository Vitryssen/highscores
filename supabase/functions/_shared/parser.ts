// Turns a pasted -dle result into a normalized run. The browser uses this for instant
// previews; the Edge Function re-runs it on the raw paste and is authoritative.

import { SHORTCODES } from './shortcodes.ts';
import { currentPuzzle } from './puzzleDate.ts';
import { type GameConfig, MAX_NAME_LENGTH, MAX_PASTE_LENGTH } from './types.ts';

export interface ParsedRun {
  puzzle: number;
  score: number | null; // null only when failed
  failed: boolean;
  paste: string; // normalized paste, stored and displayed
}

export type ParseResult = { ok: true; run: ParsedRun } | { ok: false; error: string };

// C0 controls except tab/newline, DEL, and bidi overrides/isolates. Zero-width joiner and
// variation selectors are kept because emoji sequences depend on them.
const UNSAFE_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function normalizePaste(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(UNSAFE_CHARS, '')
    .replace(/:([a-z0-9_+-]+):/g, (match, name: string) => SHORTCODES[name] ?? match)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Display name as stored. The database derives the case-insensitive identity key from it. */
export function normalizeName(input: string): string {
  return input
    .normalize('NFKC')
    .replace(UNSAFE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateName(input: string): string | null {
  if (input.length > MAX_NAME_LENGTH * 4) return 'Name is too long.';
  const name = normalizeName(input);
  if (!name) return 'Enter a name.';
  if (name.length > MAX_NAME_LENGTH) return `Name can be at most ${MAX_NAME_LENGTH} characters.`;
  return null;
}

export function compileRegex(game: Pick<GameConfig, 'parse_regex' | 'regex_flags'>): RegExp {
  // Global/sticky flags make RegExp stateful between calls, so they're never allowed.
  return new RegExp(game.parse_regex, game.regex_flags.replace(/[gy]/g, ''));
}

function groupNames(re: RegExp): Set<string> {
  return new Set([...re.source.matchAll(/\(\?<([A-Za-z_][A-Za-z0-9_]*)>/g)].map((m) => m[1]));
}

/** Problems with a game's parsing config, for the admin form. Empty when valid. */
export function configErrors(game: GameConfig): string[] {
  let re: RegExp;
  try {
    re = compileRegex(game);
  } catch (e) {
    return [`Invalid regex: ${(e as Error).message}`];
  }
  const errors: string[] = [];
  const groups = groupNames(re);
  if (game.score_regex !== null) {
    try {
      if (!groupNames(compileRegex({ ...game, parse_regex: game.score_regex })).has('score')) {
        errors.push('Score regex needs a (?<score>…) group.');
      }
    } catch (e) {
      errors.push(`Invalid score regex: ${(e as Error).message}`);
    }
    if (game.score_type === 'tiers') errors.push("Tier scores can't be summed.");
  } else if (!groups.has('score')) {
    errors.push('Regex needs a (?<score>…) group.');
  }
  if (game.puzzle_source === 'paste' && !groups.has('puzzle')) {
    errors.push('Regex needs a (?<puzzle>…) group, or switch the game to date-based puzzles.');
  }
  return errors;
}

/** Heuristic ReDoS warnings: a quantified group that itself contains a quantifier. */
export function regexWarnings(source: string): string[] {
  const nested = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/;
  return nested.test(source)
    ? ['Nested quantifiers like (a+)+ can be very slow on long pastes. Try to avoid them.']
    : [];
}

function parseInteger(text: string): number | null {
  const digits = text.replace(/[\s,.'’_]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[\s,'’_]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseTime(text: string): number | null {
  const m = text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (m) {
    const [, h, mm, ss] = m;
    if (Number(ss) > 59 || (h !== undefined && Number(mm) > 59)) return null;
    return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
  }
  const secs = text.trim().match(/^(\d+)\s*s?$/);
  return secs ? Number(secs[1]) : null;
}

type ScoreResult = { score: number | null; failed: boolean } | { error: string };

function parseScore(game: GameConfig, text: string, failGroup: boolean): ScoreResult {
  if (failGroup) return { score: null, failed: true };
  const value = text.trim();
  switch (game.score_type) {
    case 'guesses': {
      if (/^x$/i.test(value)) return { score: null, failed: true };
      const n = parseInteger(value);
      if (n === null || n < 1 || n > (game.max_guesses ?? 0)) {
        return { error: `"${value}" isn't a valid guess count.` };
      }
      return { score: n, failed: false };
    }
    case 'number': {
      const n = parseNumber(value);
      return n === null ? { error: `"${value}" isn't a number.` } : { score: n, failed: false };
    }
    case 'tiers': {
      const i = (game.tiers ?? []).findIndex((t) => t.toLowerCase() === value.toLowerCase());
      return i < 0 ? { error: `"${value}" isn't a known tier.` } : { score: i, failed: false };
    }
    case 'time': {
      const n = parseTime(value);
      return n === null ? { error: `"${value}" isn't a valid time.` } : { score: n, failed: false };
    }
  }
}

function singleScore(game: GameConfig, groups: Record<string, string | undefined>): ScoreResult {
  if (groups.score === undefined && groups.fail === undefined) {
    return { error: "Couldn't find the score." };
  }
  return parseScore(game, groups.score ?? '', groups.fail !== undefined);
}

const MAX_SUMMED_MATCHES = 50;

function summedScore(game: GameConfig, paste: string, failGroup: boolean): ScoreResult {
  if (failGroup) return { score: null, failed: true };
  let re: RegExp;
  try {
    re = new RegExp(game.score_regex ?? '', compileRegex(game).flags + 'g');
  } catch {
    return { error: "This game's format is misconfigured." };
  }
  let total = 0;
  let count = 0;
  for (const m of paste.matchAll(re)) {
    if (++count > MAX_SUMMED_MATCHES) return { error: 'Too many scores in this paste.' };
    if (m[0] === '') return { error: "This game's format is misconfigured." };
    const item = parseScore(game, m.groups?.score ?? '', false);
    if ('error' in item) return item;
    if (item.failed) return { score: null, failed: true };
    total += item.score ?? 0;
  }
  if (count === 0) return { error: "Couldn't find the score." };
  if (game.score_count !== null && count !== game.score_count) {
    return { error: `Expected ${game.score_count} scores but found ${count}. Finish every mode first.` };
  }
  return { score: total, failed: false };
}

export function parsePaste(game: GameConfig, input: string, at: Date = new Date()): ParseResult {
  if (input.length > MAX_PASTE_LENGTH * 2) return { ok: false, error: 'Paste is too long.' };
  const paste = normalizePaste(input);
  if (!paste) return { ok: false, error: 'Paste your result.' };
  if (paste.length > MAX_PASTE_LENGTH) return { ok: false, error: 'Paste is too long.' };

  let re: RegExp;
  try {
    re = compileRegex(game);
  } catch {
    return { ok: false, error: "This game's format is misconfigured." };
  }
  const groups = re.exec(paste)?.groups;
  if (!groups) return { ok: false, error: "That doesn't look like a result for this game." };

  let puzzle: number;
  if (game.puzzle_source === 'paste') {
    const n = groups.puzzle === undefined ? null : parseInteger(groups.puzzle);
    if (n === null) return { ok: false, error: 'Couldn\'t find the puzzle number.' };
    puzzle = n;
  } else {
    puzzle = currentPuzzle(game, at);
  }

  const score =
    game.score_regex === null
      ? singleScore(game, groups)
      : summedScore(game, paste, groups.fail !== undefined);
  if ('error' in score) return { ok: false, error: score.error };
  if (
    score.score !== null &&
    ((game.min_score !== null && score.score < game.min_score) ||
      (game.max_score !== null && score.score > game.max_score))
  ) {
    return { ok: false, error: `A score of ${score.score} isn't possible in this game.` };
  }

  return { ok: true, run: { puzzle, ...score, paste } };
}

/** Human-readable score, e.g. "3/6", "X/6", "7,737", "RARE", "1:05". */
export function formatScore(game: GameConfig, score: number | null, failed: boolean): string {
  if (game.score_type === 'guesses') return `${failed ? 'X' : score}/${game.max_guesses}`;
  if (failed || score === null) return 'Failed';
  switch (game.score_type) {
    case 'number':
      return score.toLocaleString('en-US');
    case 'tiers':
      return game.tiers?.[score] ?? String(score);
    case 'time': {
      const h = Math.floor(score / 3600);
      const m = Math.floor((score % 3600) / 60);
      const s = String(score % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    }
  }
}

/** Every game whose format matches, for auto-detect. Score validity is checked afterwards, so
 * a matched paste with a bad score gets a specific error instead of "no game matches". */
export function detectGames<T extends GameConfig>(games: T[], input: string): T[] {
  if (input.length > MAX_PASTE_LENGTH * 2) return [];
  const paste = normalizePaste(input);
  return games.filter((g) => {
    try {
      return compileRegex(g).test(paste);
    } catch {
      return false;
    }
  });
}
