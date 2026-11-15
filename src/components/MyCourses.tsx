import React from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clock, Laptop, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useBrightspace } from '../brightspace/useBrightspace';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const Badge: React.FC<{ tone: 'success' | 'muted' | 'warning'; children: React.ReactNode }> = ({ tone, children }) => {
  const cls = {
    success: 'bg-success-soft text-success border-success/25',
    muted: 'bg-sunken text-muted border-line',
    warning: 'bg-warning-soft text-warning border-warning/25',
  }[tone];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${cls}`}>{children}</span>;
};

const MyCourses: React.FC = () => {
  const { user } = useAuth();
  const { status, connect } = useBrightspace();
  const busy = status.kind === 'connecting';

  const buttonLabel =
    status.kind === 'connecting' ? 'Connecting to Brightspace…'
    : status.kind === 'connected' ? 'Refresh courses'
    : status.kind === 'action_required' || status.kind === 'pending' ? 'Check again'
    : status.kind === 'error' ? 'Try again'
    : 'Connect to Brightspace';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
      <p className="eyebrow mb-2">Brightspace</p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">My Courses</h1>
        {status.kind === 'connected' && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success text-xs font-bold border border-success/25">
            <CheckCircle2 size={14} aria-hidden="true" /> Connected
          </span>
        )}
      </div>

      {/* Explainer + action */}
      <section className="surface rounded-2xl p-6 mt-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-11 h-11 rounded-xl bg-gold-soft text-gold-ink flex items-center justify-center shrink-0" aria-hidden="true">
          <Laptop size={22} />
        </div>
        <div className="flex-1 text-sm text-muted leading-relaxed">
          <p className="font-semibold text-ink text-base mb-1">Uses the Brightspace sign-in on this computer</p>
          TrojanMind connects through the local Brightspace connector set up on this computer and loads your
          courses automatically after you log in. TrojanMind never asks for your USC password; only course
          names, codes, IDs, and access status are shown here.
        </div>
        <button type="button" onClick={connect} disabled={busy} className="btn-primary px-5 py-3 rounded-lg font-semibold shrink-0">
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : status.kind === 'connected' ? <RefreshCw size={16} aria-hidden="true" /> : null}
          {buttonLabel}
        </button>
      </section>

      <div className="mt-6" aria-live="polite">
        {(status.kind === 'connecting' || status.kind === 'idle') && (
          <div className="surface rounded-2xl p-8 flex flex-col items-center gap-3 text-center" role="status">
            <div className="spinner" aria-hidden="true" />
            <p className="font-semibold text-ink">Connecting to Brightspace…</p>
            <p className="text-sm text-muted max-w-md">
              Checking the saved Brightspace connection on this computer. If a sign-in is needed, this can take up to a minute.
            </p>
          </div>
        )}

        {(status.kind === 'action_required' || status.kind === 'pending') && (
          <div role="status" className="rounded-2xl border border-gold/60 bg-gold-soft p-6">
            <div className="flex items-start gap-3">
              {status.kind === 'action_required'
                ? <Smartphone size={20} className="text-gold-ink shrink-0 mt-0.5" aria-hidden="true" />
                : <Clock size={20} className="text-gold-ink shrink-0 mt-0.5" aria-hidden="true" />}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gold-ink">
                  {status.kind === 'action_required' ? 'Action needed to finish connecting to Brightspace' : 'Still connecting to Brightspace'}
                </p>
                <p className="text-sm text-ink mt-1 leading-relaxed break-words">{status.message}</p>
                <button type="button" onClick={connect} className="btn-primary mt-4 px-4 py-2 rounded-lg text-sm font-semibold">
                  Check again
                </button>
              </div>
            </div>
          </div>
        )}

        {status.kind === 'error' && <ErrorPanel code={status.code} message={status.message} uid={user?.uid ?? ''} onRetry={connect} />}

        {status.kind === 'connected' && status.courses.length === 0 && (
          <div className="surface rounded-2xl p-8 text-center">
            <BookOpen size={28} className="mx-auto text-muted mb-3" aria-hidden="true" />
            <p className="font-semibold text-ink">No courses found</p>
            <p className="text-sm text-muted mt-1">Brightspace returned no active course enrollments for this account.</p>
          </div>
        )}

        {status.kind === 'connected' && status.courses.length > 0 && (
          <>
            <p className="text-xs text-muted mb-3">
              {status.courses.length} course{status.courses.length === 1 ? '' : 's'} · retrieved{' '}
              {new Date(status.retrievedAt).toLocaleTimeString()}
            </p>
            <ul className="grid gap-3">
              {status.courses.map((c) => {
                const start = formatDate(c.startDate);
                const end = formatDate(c.endDate);
                return (
                  <li key={c.id} className="surface rounded-xl p-5 border-l-4 border-l-cardinal">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-bold text-ink leading-snug break-words">{c.name}</h2>
                        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                          <div><dt className="inline font-semibold">Code: </dt><dd className="inline font-mono text-ink">{c.code ?? '—'}</dd></div>
                          <div><dt className="inline font-semibold">ID: </dt><dd className="inline font-mono text-ink">{c.id}</dd></div>
                          {c.role && <div><dt className="inline font-semibold">Role: </dt><dd className="inline text-ink">{c.role}</dd></div>}
                          {(start || end) && (
                            <div><dt className="inline font-semibold">Dates: </dt><dd className="inline text-ink">{start ?? '?'} – {end ?? '?'}</dd></div>
                          )}
                        </dl>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {c.canAccess === true ? <Badge tone="success">Can access</Badge> : c.canAccess === false ? <Badge tone="warning">No access</Badge> : <Badge tone="muted">Access unknown</Badge>}
                        {c.isActive === true ? <Badge tone="success">Active</Badge> : c.isActive === false ? <Badge tone="muted">Inactive</Badge> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

const ErrorPanel: React.FC<{ code: string; message: string; uid: string; onRetry: () => void }> = ({ code, message, uid, onRetry }) => {
  let title = 'Could not connect to Brightspace';
  let detail: React.ReactNode = message;
  let canRetry = true;

  if (code === 'unreachable') {
    title = 'Local connector not running';
    detail = (
      <>
        Start it in a second terminal with <code className="font-mono text-ink">npm run server</code>, then try again. The
        connector only runs on this computer alongside <code className="font-mono text-ink">npm run dev</code>; it isn't
        available on the deployed site.
      </>
    );
  } else if (code === 'not_owner') {
    title = 'Brightspace not available for this account';
    canRetry = false;
  } else if (code === 'connector_not_configured') {
    title = 'Local connector setup incomplete';
    detail = (
      <>
        {message} Your TrojanMind user ID is <code className="font-mono text-ink break-all">{uid}</code>; use it for{' '}
        <code className="font-mono text-ink">LOCAL_BRIGHTSPACE_OWNER_UID</code> only if the Brightspace sign-in on this computer is yours.
      </>
    );
  } else if (code === 'brightspace_identity_mismatch' || code === 'brightspace_identity_unknown') {
    title = 'Brightspace account not confirmed';
  }

  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-danger">{title}</p>
          <p className="text-sm text-ink mt-1 leading-relaxed break-words">{detail}</p>
          {canRetry && (
            <button type="button" onClick={onRetry} className="btn-secondary mt-4 px-4 py-2 rounded-lg text-sm font-semibold">
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyCourses;
