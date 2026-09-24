import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_DECLINE_REASON } from '@shared/requests.ts';
import { formatDay } from '../lib/format.ts';
import { deleteRequest, fetchRequestsAdmin, resolveRequest, type AdminGameRequest } from './adminApi.ts';
import { GameEditor } from './GameEditor.tsx';

export function RequestsAdmin() {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ['admin-requests'], queryFn: fetchRequestsAdmin });
  const [adding, setAdding] = useState<AdminGameRequest | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries();
  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (adding) {
    const d = adding.game_request_details;
    return (
      <GameEditor
        game={null}
        prefill={{ name: adding.name, url: d?.url ?? '', sample: d?.sample_paste ?? '' }}
        onDone={async (saved) => {
          setAdding(null);
          if (saved) await run(() => resolveRequest(adding.id, { status: 'added', game_id: saved.id }));
        }}
      />
    );
  }

  function decline(r: AdminGameRequest) {
    const reason = window.prompt(`Decline ${r.name}? Optionally give a reason, shown publicly:`, '');
    if (reason === null) return;
    const trimmed = reason.trim().slice(0, MAX_DECLINE_REASON);
    run(() => resolveRequest(r.id, { status: 'declined', decline_reason: trimmed || null }));
  }

  function remove(r: AdminGameRequest) {
    if (window.confirm(`Delete the request for ${r.name}? It disappears from the public list and can be requested again.`)) {
      run(() => deleteRequest(r.id));
    }
  }

  const all = requests.data ?? [];
  const pending = all.filter((r) => r.status === 'pending').sort((a, b) => b.votes - a.votes);
  const resolved = all.filter((r) => r.status !== 'pending');

  return (
    <section className="panel stack">
      <div className="panel-head">
        <h2 className="panel-title">Game requests</h2>
        {resolved.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </button>
        )}
      </div>
      {error && <p className="msg error">{error}</p>}
      {requests.isLoading && <p className="muted blink">LOADING…</p>}
      {requests.data && !pending.length && <p className="muted">No pending requests.</p>}
      {[...pending, ...(showResolved ? resolved : [])].map((r) => {
        const d = r.game_request_details;
        return (
          <article key={r.id} className="request-card stack">
            <div className="panel-head">
              <h3 className="player">
                {r.name} <span className="muted small">+{r.votes}</span>
              </h3>
              <span className={`tag status-${r.status}`}>{r.status}</span>
            </div>
            <p className="muted small">
              {formatDay(r.created_at.slice(0, 10))}
              {r.requested_by && ` · by ${r.requested_by}`}
              {r.decline_reason && ` · declined: ${r.decline_reason}`}
            </p>
            {d && (
              <>
                {/* User-written link: shown as text so the admin sees exactly where it goes. */}
                <a className="request-url" href={d.url} target="_blank" rel="noopener noreferrer nofollow">
                  {d.url}
                </a>
                {d.note && <p className="msg">{d.note}</p>}
                <pre className="paste request-sample">{d.sample_paste}</pre>
              </>
            )}
            <div className="toggle">
              {r.status === 'pending' && (
                <>
                  <button type="button" onClick={() => setAdding(r)}>
                    Add game ▶
                  </button>
                  <button type="button" onClick={() => decline(r)}>
                    Decline
                  </button>
                </>
              )}
              {r.status === 'declined' && (
                <button type="button" onClick={() => run(() => resolveRequest(r.id, { status: 'pending' }))}>
                  Reopen
                </button>
              )}
              <button type="button" className="danger" onClick={() => remove(r)}>
                Delete
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
