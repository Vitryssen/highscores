import { useId, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_NAME_LENGTH, MAX_PASTE_LENGTH } from '@shared/types.ts';
import { detectGames, validateName } from '@shared/parser.ts';
import { MAX_REQUEST_NAME, MAX_REQUEST_NOTE, MAX_REQUEST_URL, urlKey } from '@shared/requests.ts';
import { fetchGameRequests, requestGame, SubmitError, type GameRequest } from '../lib/api.ts';
import { useGames } from '../lib/useGames.ts';
import { load, NAME_KEY } from '../lib/storage.ts';

const STATUS_LABEL = { pending: 'Wanted', added: 'Added', declined: 'Declined' } as const;

export function RequestPage() {
  const ids = useId();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: games = [] } = useGames();
  const requests = useQuery({ queryKey: ['game-requests'], queryFn: fetchGameRequests });

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [paste, setPaste] = useState(() => (location.state as { paste?: string } | null)?.paste ?? '');
  const [requestedBy, setRequestedBy] = useState(() => load(NAME_KEY) ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; game?: { slug: string; name: string } } | null>(
    null,
  );

  // The same checks the server makes, so the obvious cases never need a round trip.
  const key = url.trim() ? urlKey(url) : null;
  const existing =
    (paste.trim() ? detectGames(games, paste)[0] : undefined) ??
    (key ? games.find((g) => g.url && urlKey(g.url) === key) : undefined);
  const nameError = requestedBy.trim() ? validateName(requestedBy) : null;
  const urlError = url.trim() && !key ? 'Use the full link, starting with https://.' : null;
  const canSubmit = !!(name.trim() && key && paste.trim() && !existing && !nameError && !busy);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await requestGame({
        name,
        url,
        paste,
        requested_by: requestedBy.trim() || undefined,
        note: note.trim() || undefined,
      });
      setResult({
        ok: true,
        text:
          r.outcome === 'created'
            ? `Thanks! ${r.name} is in the queue.`
            : r.outcome === 'voted'
              ? `${r.name} was already requested, so it got your +1 instead.`
              : `You've already asked for ${r.name}. It's in the queue.`,
      });
      setName('');
      setUrl('');
      setPaste('');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['game-requests'] });
    } catch (err) {
      setResult(
        err instanceof SubmitError
          ? { ok: false, text: err.message, game: err.game }
          : { ok: false, text: 'Something went wrong. Try again.' },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <h1 className="neon">Request a game</h1>
        <p className="muted">Missing a daily -dle? Tell the admin, and it could get its own leaderboard.</p>
      </section>
      <div className="game-grid">
        <form className="panel paste-box" onSubmit={onSubmit}>
          <h2 className="panel-title">New request</h2>

          <label htmlFor={`${ids}-name`}>Game</label>
          <input
            id={`${ids}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_REQUEST_NAME}
            placeholder="e.g. Connections"
            required
          />

          <label htmlFor={`${ids}-url`}>Link</label>
          <input
            id={`${ids}-url`}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={MAX_REQUEST_URL}
            placeholder="https://…"
            required
          />
          {urlError && <p className="msg error">{urlError}</p>}

          <label htmlFor={`${ids}-paste`}>A result you shared</label>
          <textarea
            id={`${ids}-paste`}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            maxLength={MAX_PASTE_LENGTH}
            rows={6}
            spellCheck={false}
            placeholder="Paste the text the game lets you share"
            required
          />
          {existing && (
            <p className="msg ok">
              {existing.name} is already here. <Link to={`/g/${existing.slug}`}>Go to its board →</Link>
            </p>
          )}

          <label htmlFor={`${ids}-by`}>Your name (optional)</label>
          <input
            id={`${ids}-by`}
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="off"
          />
          {nameError && <p className="msg error">{nameError}</p>}

          <label htmlFor={`${ids}-note`}>Note for the admin (optional)</label>
          <input
            id={`${ids}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_REQUEST_NOTE}
            placeholder="e.g. new puzzle at 06:00"
          />

          <button type="submit" className="btn" disabled={!canSubmit}>
            {busy ? 'SENDING…' : 'REQUEST ▶'}
          </button>
          {result && (
            <p className={`msg ${result.ok ? 'win' : 'error'}`} role={result.ok ? 'status' : 'alert'}>
              {result.text}
              {result.game && (
                <>
                  {' '}
                  <Link to={`/g/${result.game.slug}`}>Go to its board →</Link>
                </>
              )}
            </p>
          )}
        </form>

        <section className="panel">
          <h2 className="panel-title">Requested games</h2>
          {requests.isLoading ? (
            <p className="muted blink">LOADING…</p>
          ) : !requests.data?.length ? (
            <p className="muted">No requests yet. Be the first!</p>
          ) : (
            <ul className="history requests">
              {requests.data.map((r) => (
                <RequestRow key={r.id} request={r} slug={games.find((g) => g.id === r.game_id)?.slug} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function RequestRow({ request: r, slug }: { request: GameRequest; slug?: string }) {
  return (
    <li className="request-row">
      <span className={`tag status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
      <span className="request-main">
        <span className="player">
          {r.status === 'added' && slug ? <Link to={`/g/${slug}`}>{r.name}</Link> : r.name}
        </span>
        {r.requested_by && <span className="muted small"> · by {r.requested_by}</span>}
        {r.status === 'declined' && r.decline_reason && (
          <span className="muted small request-reason">{r.decline_reason}</span>
        )}
      </span>
      {r.status === 'pending' && (
        <span className="points" title={`${r.votes} ${r.votes === 1 ? 'person wants' : 'people want'} this`}>
          +{r.votes}
        </span>
      )}
    </li>
  );
}
