// CORS, JSON responses, the service-role client and IP hashing, shared by the Edge Functions.
// Deno only: the web app never imports this file.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ?? 'https://vitryssen.github.io,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const MAX_BODY_BYTES = 16_384;

export const db: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Every games column the parser needs, selected explicitly by the service role. */
export const GAME_COLUMNS =
  'id, slug, name, url, score_type, higher_is_better, max_guesses, tiers, min_score, max_score, ' +
  'parse_regex, regex_flags, score_regex, score_count, puzzle_source, anchor_puzzle, anchor_date, ' +
  'reset_time, timezone, sample_pastes, active, created_at';

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(status: number, body: unknown, cors: Record<string, string>): Response {
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

/** Keyed hash of the client IP, so the database never stores raw addresses. */
export async function clientKey(req: Request): Promise<string> {
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const mac = await crypto.subtle.sign('HMAC', await hmacKey, new TextEncoder().encode(ip));
  return [...new Uint8Array(mac).slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Reads a JSON body of at most MAX_BODY_BYTES. `value` is undefined when it isn't valid JSON. */
export async function readJson(req: Request): Promise<{ tooLarge: boolean; value?: unknown }> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return { tooLarge: true };
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return { tooLarge: true };
  try {
    return { tooLarge: false, value: JSON.parse(text) };
  } catch {
    return { tooLarge: false };
  }
}
