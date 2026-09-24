// POST a request for a new game. Rejects games that are already here, counts a repeat request
// as a +1 on the pending one, and otherwise queues it for the admin.

import { ALLOWED_ORIGINS, clientKey, corsHeaders, db, GAME_COLUMNS, json, readJson } from '../_shared/http.ts';
import { detectGames, normalizeName, normalizePaste, validateName } from '../_shared/parser.ts';
import { MAX_REQUEST_NAME, MAX_REQUEST_NOTE, MAX_REQUEST_URL, urlKey } from '../_shared/requests.ts';
import { type Game, MAX_PASTE_LENGTH } from '../_shared/types.ts';

const RATE_WINDOW_SECONDS = 3600;
const REQUEST_LIMIT = 5; // per IP per window, votes included
const MAX_PENDING = 50; // queue size, so a flood can't bury real requests

type ErrorCode =
  | 'bad_request'
  | 'too_large'
  | 'rate_limited'
  | 'invalid'
  | 'already_supported'
  | 'already_added'
  | 'declined'
  | 'queue_full'
  | 'server_error';

interface RequestBody {
  name: string;
  url: string;
  paste: string;
  requested_by?: string;
  note?: string;
}

function parseBody(raw: unknown): RequestBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const optional = (v: unknown) => v === undefined || v === null || typeof v === 'string';
  if (typeof b.name !== 'string' || typeof b.url !== 'string' || typeof b.paste !== 'string') return null;
  if (!optional(b.requested_by) || !optional(b.note)) return null;
  return {
    name: b.name,
    url: b.url,
    paste: b.paste,
    requested_by: (b.requested_by as string | null) ?? undefined,
    note: (b.note as string | null) ?? undefined,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);
  const fail = (status: number, code: ErrorCode, message: string, extra: object = {}) =>
    json(status, { error: { code, message, ...extra } }, cors);

  if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response(null, { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');

  try {
    const raw = await readJson(req);
    if (raw.tooLarge) return fail(413, 'too_large', 'Request is too large.');
    const body = parseBody(raw.value);
    if (!body) return fail(400, 'bad_request', 'Invalid request.');

    const voter = await clientKey(req);
    const { data: allowed, error: limitError } = await db.rpc('hit_rate_limit', {
      p_key: `request:${voter}`,
      p_limit: REQUEST_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (limitError) throw limitError;
    if (!allowed) return fail(429, 'rate_limited', 'Too many requests. Try again in an hour.');

    const name = normalizeName(body.name.slice(0, MAX_REQUEST_NAME * 4));
    if (!name) return fail(400, 'invalid', "Enter the game's name.");
    if (name.length > MAX_REQUEST_NAME) return fail(400, 'invalid', `Name can be at most ${MAX_REQUEST_NAME} characters.`);

    const url = body.url.trim();
    const key = url.length <= MAX_REQUEST_URL ? urlKey(url) : null;
    if (!key) return fail(400, 'invalid', 'Enter a link to the game starting with https://.');

    if (body.paste.length > MAX_PASTE_LENGTH * 2) return fail(413, 'too_large', 'Paste is too long.');
    const paste = normalizePaste(body.paste);
    if (!paste) return fail(400, 'invalid', 'Paste a result from the game.');
    if (paste.length > MAX_PASTE_LENGTH) return fail(400, 'invalid', 'Paste is too long.');

    let requestedBy: string | null = null;
    if (body.requested_by?.trim()) {
      const nameError = validateName(body.requested_by);
      if (nameError) return fail(400, 'invalid', nameError);
      requestedBy = normalizeName(body.requested_by);
    }

    const note = body.note ? normalizePaste(body.note.slice(0, MAX_REQUEST_NOTE * 4)) || null : null;
    if (note && note.length > MAX_REQUEST_NOTE) {
      return fail(400, 'invalid', `Note can be at most ${MAX_REQUEST_NOTE} characters.`);
    }

    const { data: games, error: gamesError } = await db
      .from('games')
      .select(GAME_COLUMNS)
      .eq('active', true)
      .returns<Game[]>();
    if (gamesError) throw gamesError;
    const existing = detectGames(games, paste)[0] ?? games.find((g) => g.url && urlKey(g.url) === key);
    if (existing) {
      return fail(409, 'already_supported', `${existing.name} is already here.`, {
        game: { slug: existing.slug, name: existing.name },
      });
    }

    const { data, error } = await db
      .rpc('create_game_request', {
        p_name: name,
        p_url: url,
        p_url_key: key,
        p_sample: paste,
        p_note: note,
        p_requested_by: requestedBy,
        p_voter: voter,
        p_max_pending: MAX_PENDING,
      })
      .single<{ request_id: string; name: string; status: string; decline_reason: string | null; outcome: string }>();
    if (error) throw error;

    switch (data.outcome) {
      case 'full':
        return fail(503, 'queue_full', 'The request queue is full right now. Try again later.');
      case 'resolved':
        return data.status === 'declined'
          ? fail(409, 'declined', `${data.name} was requested before and declined.`, { reason: data.decline_reason })
          : fail(409, 'already_added', `${data.name} was requested before and has been added.`);
      default:
        return json(data.outcome === 'created' ? 201 : 200, {
          request_id: data.request_id,
          name: data.name,
          outcome: data.outcome, // created | voted | already_voted
        }, cors);
    }
  } catch (e) {
    console.error('request-game failed', e);
    return fail(500, 'server_error', 'Something went wrong. Try again.');
  }
});
