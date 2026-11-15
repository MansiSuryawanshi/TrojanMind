import React, { useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronRight, Clock, KeyRound, Laptop, Link2, Loader2, RefreshCw, ShieldCheck, Smartphone, Upload } from 'lucide-react';
import CourseDetail from './CourseDetail';
import { useAuth } from '../auth/useAuth';
import { useBrightspace } from '../brightspace/useBrightspace';
import { LOCAL_DEMO_LABEL, type ConnectionState, type Course } from '../brightspace/brightspaceContext';
import { groupCoursesBySemester } from '../brightspace/semesters';

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

const STATE_BADGE: Record<ConnectionState, { label: string; cls: string }> = {
  not_connected: { label: 'Not connected', cls: 'bg-sunken text-muted border-line' },
  connecting: { label: 'Connecting', cls: 'bg-sunken text-muted border-line' },
  connected: { label: 'Connected', cls: 'bg-success-soft text-success border-success/25' },
  expired: { label: 'Expired', cls: 'bg-gold-soft text-gold-ink border-gold/60' },
  error: { label: 'Error', cls: 'bg-danger-soft text-danger border-danger/30' },
};

const StateBadge: React.FC<{ state: ConnectionState }> = ({ state }) => {
  const b = STATE_BADGE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${b.cls}`}>
      {state === 'connected' && <CheckCircle2 size={14} aria-hidden="true" />}
      {b.label}
    </span>
  );
};

const UploadPrompt: React.FC<{ onUpload: () => void }> = ({ onUpload }) => (
  <section
    aria-labelledby="add-own-material"
    className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
  >
    <div className="w-9 h-9 rounded-lg bg-cardinal-soft text-cardinal flex items-center justify-center shrink-0" aria-hidden="true">
      <Upload size={18} />
    </div>
    <div className="flex-1 text-sm text-muted leading-relaxed">
      <p id="add-own-material" className="font-semibold text-ink mb-0.5">Want to practice on this material?</p>
      Reasoning challenges are generated from text you add to TrojanMind. Brightspace selections are saved as
      links only, so paste or upload the content you want to be quizzed on, including notes that aren’t on Brightspace.
    </div>
    <button type="button" onClick={onUpload} className="btn-secondary px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0">
      Add your own material
    </button>
  </section>
);

const MyCourses: React.FC<{ onUpload?: () => void }> = ({ onUpload }) => {
  const { connection, status } = useBrightspace();

  if (connection.resolving) {
    return (
      <Shell>
        <div className="surface rounded-2xl p-8 mt-6 flex flex-col items-center gap-3 text-center" role="status">
          <div className="spinner" aria-hidden="true" />
          <p className="font-semibold text-ink">Checking your Brightspace connection…</p>
        </div>
      </Shell>
    );
  }

  // On the deployed site there is no local connector, so an unreachable
  // connector just means this user needs an individual connection.
  const deployedWithoutConnector = !import.meta.env.DEV && connection.method === null && status.kind === 'error' && status.code === 'unreachable';
  if (connection.method === 'individual' || deployedWithoutConnector) {
    return (
      <Shell badge={<StateBadge state="not_connected" />}>
        <IndividualConnectionPanel />
        {onUpload && <UploadPrompt onUpload={onUpload} />}
      </Shell>
    );
  }

  return <LocalDemoCourses onUpload={onUpload} />;
};

const Shell: React.FC<{ badge?: React.ReactNode; children: React.ReactNode }> = ({ badge, children }) => (
  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
    <p className="eyebrow mb-2">Brightspace</p>
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">My Courses</h1>
      {badge}
    </div>
    {children}
  </div>
);

/**
 * Per-user Brightspace connection. Shown to everyone except the configured
 * local demo owner. Not available yet: there is no registered Brightspace
 * OAuth app, so nothing here starts a sign-in or reports a connection.
 */
const IndividualConnectionPanel: React.FC = () => (
  <section aria-labelledby="connect-own-brightspace" className="surface rounded-2xl p-6 mt-6">
    <div className="flex flex-col sm:flex-row sm:items-start gap-5">
      <div className="w-11 h-11 rounded-xl bg-cardinal-soft text-cardinal flex items-center justify-center shrink-0" aria-hidden="true">
        <Link2 size={22} />
      </div>
      <div className="flex-1 min-w-0 text-sm text-muted leading-relaxed">
        <h2 id="connect-own-brightspace" className="font-semibold text-ink text-base mb-1">Connect your Brightspace account</h2>
        <p>
          Individual Brightspace connections aren’t available yet. They need an official Brightspace integration
          approved by USC, which TrojanMind doesn’t have yet. Until then, your Brightspace courses can’t be loaded here.
        </p>
        <ul className="mt-3 grid gap-2">
          <li className="flex items-start gap-2">
            <ShieldCheck size={16} className="text-success shrink-0 mt-0.5" aria-hidden="true" />
            <span>When it’s ready, you’ll sign in on Brightspace’s own page and approve access there.</span>
          </li>
          <li className="flex items-start gap-2">
            <KeyRound size={16} className="text-success shrink-0 mt-0.5" aria-hidden="true" />
            <span>TrojanMind will never ask for your USC password, and never ask you to paste cookies or tokens.</span>
          </li>
        </ul>
      </div>
      <button
        type="button"
        disabled
        aria-describedby="connect-own-brightspace"
        className="btn-primary px-5 py-3 rounded-lg font-semibold shrink-0"
      >
        Not available yet
      </button>
    </div>
  </section>
);

/** The owner-only local demo connector: unchanged behavior, clearly labeled. */
const LocalDemoCourses: React.FC<{ onUpload?: () => void }> = ({ onUpload }) => {
  const { user } = useAuth();
  const { connection, status, connect, selections } = useBrightspace();
  const busy = status.kind === 'connecting';
  const [open, setOpen] = useState<{ course: Course; semesterLabel: string } | null>(null);
  const isLocalDemo = connection.method === 'local_demo';

  const backToList = () => {
    setOpen(null);
    window.scrollTo({ top: 0 });
  };

  if (open) {
    return <CourseDetail key={open.course.id} course={open.course} semesterLabel={open.semesterLabel} onBack={backToList} />;
  }

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
        {isLocalDemo && <StateBadge state={connection.state} />}
      </div>

      {/* Explainer + action */}
      <section className="surface rounded-2xl p-6 mt-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-11 h-11 rounded-xl bg-gold-soft text-gold-ink flex items-center justify-center shrink-0" aria-hidden="true">
          <Laptop size={22} />
        </div>
        <div className="flex-1 text-sm text-muted leading-relaxed">
          <p className="font-semibold text-ink text-base mb-1 flex flex-wrap items-center gap-2">
            {LOCAL_DEMO_LABEL}
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gold-soft text-gold-ink text-[11px] font-bold">Owner only</span>
          </p>
          Uses the Brightspace sign-in on this computer. TrojanMind connects through the local Brightspace connector set up on this computer and loads your
          courses automatically after you log in. TrojanMind never asks for your USC password; only course
          names, codes, IDs, and access status are shown here.
        </div>
        <button type="button" onClick={connect} disabled={busy}className="btn-primary px-5 py-3 rounded-lg font-semibold shrink-0">
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : status.kind === 'connected' ? <RefreshCw size={16} aria-hidden="true" /> : null}
          {buttonLabel}
        </button>
      </section>

      {onUpload && <UploadPrompt onUpload={onUpload} />}

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
                  {connection.state === 'expired'
                    ? 'Your Brightspace connection expired'
                    : status.kind === 'action_required' ? 'Action needed to finish connecting to Brightspace' : 'Still connecting to Brightspace'}
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
            <div className="grid gap-8">
              {groupCoursesBySemester(status.courses).map((section) => (
                <section key={section.key} aria-labelledby={`sem-${section.key}`}>
                  <h2 id={`sem-${section.key}`} className="eyebrow mb-3">{section.title}</h2>
                  {section.key === 'unconfirmed' && (
                    <p className="text-xs text-muted mb-3 leading-relaxed">
                      These course codes have a term prefix that hasn't been confirmed in{' '}
                      <code className="font-mono text-ink">src/config/semesterTerms.ts</code>, so they aren't labeled current or past yet.
                    </p>
                  )}
                  <div className="grid gap-5">
                    {section.groups.map((group) => (
                      <div key={group.key}>
                        {section.key !== 'other' && (
                          <h3 className="text-sm font-bold text-ink mb-2">{group.label}</h3>
                        )}
                        <ul className="grid gap-3">
                          {group.courses.map((c) => (
                            <CourseCard
                              key={c.id}
                              course={c}
                              semesterLabel={group.label}
                              selectedCount={Object.keys(selections[c.id] ?? {}).length}
                              onOpen={() => {
                                setOpen({ course: c, semesterLabel: group.label });
                                window.scrollTo({ top: 0 });
                              }}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const CourseCard: React.FC<{ course: Course; semesterLabel: string; selectedCount: number; onOpen: () => void }> = ({
  course: c, semesterLabel, selectedCount, onOpen,
}) => {
  const start = formatDate(c.startDate);
  const end = formatDate(c.endDate);
  const canOpen = c.canAccess !== false;
  const body = (
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gold-soft text-gold-ink text-[11px] font-bold mb-1.5">
            {semesterLabel}
          </span>
          <h4 className="font-bold text-ink leading-snug break-words">{c.name}</h4>
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
          {canOpen && <ChevronRight size={20} className="text-muted self-center hidden sm:block" aria-hidden="true" />}
        </div>
      </div>
  );
  return (
    <li>
      {canOpen ? (
        <div className="relative surface rounded-xl p-5 border-l-4 border-l-cardinal transition-shadow hover:shadow-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cardinal">
          {body}
          {/* Stretched button: the whole card is clickable, markup stays valid. */}
          <button
            type="button"
            onClick={onOpen}
            className="mt-3 text-xs font-semibold text-cardinal text-left focus:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            aria-label={`Open ${c.name} course content${selectedCount > 0 ? `, ${selectedCount} selected` : ''}`}
          >
            Browse course content{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
          </button>
        </div>
      ) : (
        <div className="surface rounded-xl p-5 border-l-4 border-l-line-strong opacity-80">
          {body}
          <p className="mt-3 text-xs text-muted">Brightspace reports this course isn't accessible, so its content can't be opened.</p>
        </div>
      )}
    </li>
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
  } else if (code === 'not_found') {
    // The connector answered but has no /connections route: it predates this version.
    title = 'Local connector needs a restart';
    detail = (
      <>
        The running connector is an older version. Stop it and run <code className="font-mono text-ink">npm run server</code> (or{' '}
        <code className="font-mono text-ink">npm run dev</code>) again, then reload this page.
      </>
    );
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
