import { useMemo, useState } from 'react';
import type { ScoreType } from '@shared/types.ts';
import { normalizePaste } from '@shared/parser.ts';
import { buildRegex, tokenize, type BuiltRegex, type Marks, type Role, type Token } from './builder.ts';

const ROLES: { role: Role; label: string; hint: string }[] = [
  { role: 'puzzle', label: 'Puzzle #', hint: 'the puzzle number (skip for games without one)' },
  { role: 'score', label: 'Score', hint: 'the score' },
  { role: 'sum', label: 'Add-up score', hint: 'one of several scores to add up (e.g. one Pokedle mode)' },
];

interface Props {
  sample: string;
  scoreType: ScoreType;
  onBuilt: (built: BuiltRegex) => void;
}

const same = (a?: Token, b?: Token) => !!a && !!b && a.line === b.line && a.start === b.start;

export function SampleBuilder({ sample, scoreType, onBuilt }: Props) {
  const paste = useMemo(() => normalizePaste(sample), [sample]);
  const { lines, tokens } = useMemo(() => tokenize(paste), [paste]);
  const [mode, setMode] = useState<Role>('puzzle');
  const [marks, setMarks] = useState<Marks>({});
  const [error, setError] = useState<string | null>(null);
  const [lastSample, setLastSample] = useState(paste);
  if (paste !== lastSample) {
    setLastSample(paste);
    setMarks({});
  }

  if (!paste) return <p className="muted">Add a sample paste above to build the format from it.</p>;

  function mark(t: Token) {
    setError(null);
    setMarks((m) => {
      const next = { ...m };
      if (same(m[mode], t)) delete next[mode];
      else next[mode] = t;
      if (mode === 'score') delete next.sum;
      if (mode === 'sum') delete next.score;
      return next;
    });
  }

  function roleOf(t: Token): Role | undefined {
    return ROLES.find(({ role }) => same(marks[role], t))?.role;
  }

  function generate() {
    const built = buildRegex(paste, marks, scoreType);
    if ('error' in built) setError(built.error);
    else onBuilt(built);
  }

  return (
    <div className="builder stack">
      <div className="toggle" role="group" aria-label="What to mark">
        {ROLES.map(({ role, label }) => (
          <button key={role} type="button" aria-pressed={mode === role} className={`mark-${role}`} onClick={() => setMode(role)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted small">Click {ROLES.find((r) => r.role === mode)?.hint} in the sample:</p>
      <pre className="builder-sample">
        {lines.map((line, i) => {
          const lineTokens = tokens.filter((t) => t.line === i);
          const parts: React.ReactNode[] = [];
          let pos = 0;
          for (const t of lineTokens) {
            if (t.start > pos) parts.push(line.slice(pos, t.start));
            const role = roleOf(t);
            parts.push(
              <button
                key={t.start}
                type="button"
                className={`token${role ? ` mark-${role}` : ''}`}
                onClick={() => mark(t)}
              >
                {t.text}
              </button>,
            );
            pos = t.end;
          }
          parts.push(line.slice(pos));
          return (
            <span key={i} className="builder-line">
              {parts}
              {'\n'}
            </span>
          );
        })}
      </pre>
      <div className="toggle">
        <button type="button" onClick={generate}>
          Generate format ▶
        </button>
        <button type="button" onClick={() => setMarks({})}>
          Clear
        </button>
      </div>
      {error && <p className="msg error">{error}</p>}
    </div>
  );
}
