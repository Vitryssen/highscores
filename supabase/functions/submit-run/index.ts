// POST a pasted result. Parses and validates it with the shared parser, then stores the run.
// This is the only way anonymous users can write data.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { detectGames, normalizeName, parsePaste, validateName } from '../_shared/parser.ts';
import { isPuzzleInWindow } from '../_shared/puzzleDate.ts';
import { type Game, MAX_PASTE_LENGTH } from '../_shared/types.ts';

const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ?? 'https://vitryssen.github.io,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const MAX_BODY_BYTES = 16_384;
const RATE_WINDOW_SECONDS = 600;
const SUBMIT_LIMIT = 10; // per IP per window
const BACKFILL_LIMIT = 100; // admin backfills, counted before the token is verified

const GAME_COLUMNS =
  'id, slug, name, url, score_type, higher_is_better, max_guesses, tiers, min_score, max_score, ' +
  'parse_regex, regex_flags, score_regex, score_count, puzzle_source, anchor_puzzle, anchor_date, ' +
  'reset_time, timezone, sample_pastes, active, created_at';

type ErrorCode =
  | 'bad_request'
  | 'too_large'
  | 'forbidden'
  | 'rate_limited'
  | 'invalid_name'
  | 'unknown_game'
  | 'no_match'
  | 'ambiguous'
  | 'parse_error'
  | 'out_of_window'
  | 'duplicate'
  | 'server_error';

interface SubmitBody {
  game_id?: string;
  player_name: string;
  paste: string;
  override?: { puzzle?: number; submitted_at?: string };
}

const db: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const hmacKey = crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
);

/** Keyed hash of the client IP, so rate_limits never stores raw addresses. */
async function clientKey(req: Request): Promise<string> {
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const mac = await crypto.subtle.sign('HMAC', await hmacKey, new TextEncoder().encode(ip));
  return [...new Uint8Array(mac).slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function parseBody(raw: unknown): SubmitBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.player_name !== 'string' || typeof b.paste !== 'string') return null;
  if (b.game_id !== undefined && (typeof b.game_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.game_id))) {
    return null;
  }
  let override: SubmitBody['override'];
  if (b.override !== undefined) {
    if (typeof b.override !== 'object' || b.override === null) return null;
    const o = b.override as Record<string, unknown>;
    if (o.puzzle !== undefined && (!Number.isInteger(o.puzzle) || (o.puzzle as number) < 0)) return null;
    if (o.submitted_at !== undefined && (typeof o.submitted_at !== 'string' || isNaN(Date.parse(o.submitted_at)))) {
      return null;
    }
    override = { puzzle: o.puzzle as number | undefined, submitted_at: o.submitted_at as string | undefined };
  }
  return { game_id: b.game_id as string | undefined, player_name: b.player_name, paste: b.paste, override };
}

function jwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
  } catch {
    return {};
  }
}

/** True only for a valid, MFA-verified (aal2) user JWT belonging to a row in public.admins. */
async function isAdmin(req: Request): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return false;
  // getUser has verified the token with the auth server, so its claims can be trusted.
  if (jwtClaims(token).aal !== 'aal2') return false;
  const { data: row, error: adminError } = await db
    .from('admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (adminError) throw adminError; // a real failure, not "not an admin"
  return row !== null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);
  const fail = (status: number, code: ErrorCode, message: string, extra: object = {}) =>
    json(status, { error: { code, message, ...extra } }, cors);

  // Browsers on other sites are refused outright. Non-browser clients send no Origin and are
  // still subject to validation and rate limiting.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response(null, { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');

  try {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return fail(413, 'too_large', 'Request is too large.');
    }
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, 'too_large', 'Request is too large.');

    let body: SubmitBody | null;
    try {
      body = parseBody(JSON.parse(text));
    } catch {
      body = null;
    }
    if (!body) return fail(400, 'bad_request', 'Invalid request.');
    if (body.paste.length > MAX_PASTE_LENGTH * 2) return fail(413, 'too_large', 'Paste is too long.');

    // Rate limit before any other work, including verifying admin tokens.
    const backfill = body.override !== undefined;
    const { data: allowed, error: limitError } = await db.rpc('hit_rate_limit', {
      p_key: `${backfill ? 'backfill' : 'submit'}:${await clientKey(req)}`,
      p_limit: backfill ? BACKFILL_LIMIT : SUBMIT_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (limitError) throw limitError;
    if (!allowed) return fail(429, 'rate_limited', 'Too many submissions. Try again in a few minutes.');

    const admin = backfill && (await isAdmin(req));
    if (backfill && !admin) return fail(403, 'forbidden', 'Only admins can backfill runs.');

    const nameError = validateName(body.player_name);
    if (nameError) return fail(400, 'invalid_name', nameError);
    const playerName = normalizeName(body.player_name);

    let query = db.from('games').select(GAME_COLUMNS).eq('active', true);
    if (body.game_id) query = query.eq('id', body.game_id);
    const { data: games, error: gamesError } = await query.returns<Game[]>();
    if (gamesError) throw gamesError;
    if (!games.length) return fail(404, 'unknown_game', 'That game does not exist.');

    let game: Game;
    if (body.game_id) {
      game = games[0];
    } else {
      const matches = detectGames(games, body.paste);
      if (!matches.length) return fail(422, 'no_match', "That doesn't look like a result for any game here.");
      if (matches.length > 1) {
        return fail(422, 'ambiguous', 'That paste matches more than one game. Pick one.', {
          candidates: matches.map((g) => ({ id: g.id, slug: g.slug, name: g.name })),
        });
      }
      game = matches[0];
    }

    const parsed = parsePaste(game, body.paste);
    if (!parsed.ok) return fail(422, 'parse_error', parsed.error);
    const puzzle = body.override?.puzzle ?? parsed.run.puzzle;
    if (!admin && !isPuzzleInWindow(game, puzzle)) {
      return fail(422, 'out_of_window', "You can only submit today's or yesterday's puzzle.");
    }

    const { data: playerId, error: playerError } = await db.rpc('ensure_player', { p_name: playerName });
    if (playerError) throw playerError;

    const { data: run, error: runError } = await db
      .from('runs')
      .insert({
        game_id: game.id,
        player_id: playerId,
        puzzle,
        score: parsed.run.score,
        failed: parsed.run.failed,
        raw_paste: parsed.run.paste,
        ...(body.override?.submitted_at ? { submitted_at: body.override.submitted_at } : {}),
      })
      .select('id')
      .single();
    if (runError?.code === '23505') {
      return fail(409, 'duplicate', `${playerName} has already submitted ${game.name} #${puzzle}.`);
    }
    if (runError) throw runError;

    const { data: result, error: resultError } = await db
      .from('puzzle_results')
      .select('place, points')
      .eq('run_id', run.id)
      .single();
    if (resultError) throw resultError;

    return json(201, {
      run_id: run.id,
      game: { id: game.id, slug: game.slug, name: game.name },
      player_name: playerName,
      puzzle,
      score: parsed.run.score,
      failed: parsed.run.failed,
      place: result.place,
      points: result.points,
    }, cors);
  } catch (e) {
    console.error('submit-run failed', e);
    return fail(500, 'server_error', 'Something went wrong. Try again.');
  }
});
