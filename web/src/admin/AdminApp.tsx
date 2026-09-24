import { useEffect, useState, type FormEvent } from 'react';
import type { Factor, Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.ts';
import { GamesAdmin } from './GamesAdmin.tsx';
import { RunsAdmin } from './RunsAdmin.tsx';
import { PlayersAdmin } from './PlayersAdmin.tsx';
import { Backfill } from './Backfill.tsx';
import { RequestsAdmin } from './RequestsAdmin.tsx';
import { fetchRequestsAdmin } from './adminApi.ts';

type Tab = 'games' | 'requests' | 'runs' | 'players' | 'backfill';

export default function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="muted blink">LOADING…</p>;
  if (!session) return <Login />;
  return <Gate session={session} />;
}

function Gate({ session }: { session: Session }) {
  const status = useQuery({
    queryKey: ['admin-status', session.user.id, session.access_token],
    queryFn: async () => {
      const [{ data: row }, aal, factors] = await Promise.all([
        supabase.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      return {
        isAdmin: row !== null,
        aal2: aal.data?.currentLevel === 'aal2',
        totp: (factors.data?.all ?? []).filter((f) => f.factor_type === 'totp'),
      };
    },
  });

  if (status.isLoading) return <p className="muted blink">LOADING…</p>;
  if (status.error || !status.data) return <p className="msg error">Couldn't check admin access.</p>;
  if (!status.data.isAdmin) {
    return (
      <section className="panel narrow">
        <h2 className="panel-title">Not an admin</h2>
        <p className="muted">{session.user.email} isn't listed as an admin.</p>
        <SignOut />
      </section>
    );
  }
  if (!status.data.aal2) return <Mfa factors={status.data.totp} />;
  return <Dashboard email={session.user.email ?? ''} />;
}

function SignOut() {
  const queryClient = useQueryClient();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={async () => {
        await supabase.auth.signOut();
        queryClient.clear();
      }}
    >
      Sign out
    </button>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <form className="panel narrow stack" onSubmit={onSubmit}>
      <h2 className="panel-title">Admin login</h2>
      <label htmlFor="admin-email">Email</label>
      <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label htmlFor="admin-password">Password</label>
      <input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'CHECKING…' : 'LOG IN ▶'}
      </button>
      {error && <p className="msg error" role="alert">{error}</p>}
    </form>
  );
}

function Mfa({ factors }: { factors: Factor[] }) {
  const queryClient = useQueryClient();
  const verified = factors.find((f) => f.status === 'verified');
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const factorId = verified?.id ?? enrolling?.id;

  async function startEnroll() {
    setBusy(true);
    setError(null);
    // Clear half-finished enrollments so a fresh QR code can be issued.
    for (const f of factors.filter((f) => f.status !== 'verified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Highscores admin' });
    if (error) setError(error.message);
    else setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setBusy(false);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['admin-status'] });
  }

  return (
    <section className="panel narrow stack">
      <h2 className="panel-title">Two-factor check</h2>
      {!verified && !enrolling && (
        <>
          <p className="muted">
            Admin actions need an authenticator app (Google Authenticator, 1Password, Authy…). Set it up once.
          </p>
          <button type="button" className="btn" onClick={startEnroll} disabled={busy}>
            SET UP AUTHENTICATOR ▶
          </button>
        </>
      )}
      {enrolling && (
        <>
          <p className="muted">Scan this with your authenticator app, then enter the 6-digit code.</p>
          <img className="qr" src={enrolling.qr} alt="QR code for your authenticator app" width={200} height={200} />
          <p className="muted small">
            Or enter this key manually: <code className="secret">{enrolling.secret}</code>
          </p>
        </>
      )}
      {factorId && (
        <form className="stack" onSubmit={verify}>
          <label htmlFor="mfa-code">Code</label>
          <input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'VERIFYING…' : 'VERIFY ▶'}
          </button>
        </form>
      )}
      {error && <p className="msg error" role="alert">{error}</p>}
      <SignOut />
    </section>
  );
}

function Dashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>('games');
  const requests = useQuery({ queryKey: ['admin-requests'], queryFn: fetchRequestsAdmin });
  const pending = requests.data?.filter((r) => r.status === 'pending').length ?? 0;
  const tabs: [Tab, string][] = [
    ['games', 'Games'],
    ['requests', pending ? `Requests (${pending})` : 'Requests'],
    ['runs', 'Runs'],
    ['players', 'Players'],
    ['backfill', 'Backfill'],
  ];
  return (
    <>
      <section className="panel-head admin-head">
        <h1 className="neon admin-title">Admin</h1>
        <div className="toggle">
          <span className="muted small">{email}</span>
          <SignOut />
        </div>
      </section>
      <nav className="toggle tabs" aria-label="Admin sections">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'games' && <GamesAdmin />}
      {tab === 'requests' && <RequestsAdmin />}
      {tab === 'runs' && <RunsAdmin />}
      {tab === 'players' && <PlayersAdmin />}
      {tab === 'backfill' && <Backfill />}
    </>
  );
}
