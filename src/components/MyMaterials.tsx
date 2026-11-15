import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, BookOpen, Brain, CalendarDays, ChevronDown, ChevronUp, FileText, FolderOpen,
  GraduationCap, Layers, ListChecks, RefreshCw, Swords, Trash2, Upload,
} from 'lucide-react';
import {
  deleteWorkspace, ensureStudyDocument, getWorkspace, listWorkspaces, loadWorkspaceTexts, syncLinkedOutputs,
  type LinkedOutputs, type Workspace, type WorkspaceItem,
} from '../services/workspaceService';
import { IMPORT_REASON_TEXT, LINK_ONLY_NOTE } from '../brightspace/contentApi';
import { ImportStatusIcon, SourceBadge, SourceLink } from './CourseDetail';
import { MaterialPractice } from './MaterialPractice';
import { useStore } from '../store/store';
import { HOME_TABS } from './homeTabs';

const when = (t: { toDate(): Date } | null) => (t ? t.toDate().toLocaleString() : '—');

interface MyMaterialsProps {
  openWorkspaceId: string | null;
  onOpenWorkspace: (id: string | null) => void;
  /** Go to another app tab. */
  onNavigate: (tab: number) => void;
  /** Open Reasoning Challenge with this study document preselected. */
  onChallenge: (documentId: string) => void;
  onUpload: () => void;
}

const MyMaterials: React.FC<MyMaterialsProps> = (props) =>
  props.openWorkspaceId
    ? <WorkspaceView key={props.openWorkspaceId} id={props.openWorkspaceId} {...props} />
    : <WorkspaceList onOpen={(id) => props.onOpenWorkspace(id)} onCourses={() => props.onNavigate(HOME_TABS.courses)} onUpload={props.onUpload} />;

// ── History list ────────────────────────────────────────────────────────────

const WorkspaceList: React.FC<{ onOpen: (id: string) => void; onCourses: () => void; onUpload: () => void }> = ({ onOpen, onCourses, onUpload }) => {
  const [list, setList] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await listWorkspaces());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load your saved materials.');
      setList([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (ws: Workspace) => {
    if (deleting) return;
    if (!window.confirm(`Delete “${ws.title}”?\n\nIts imported text and the study document made from it are removed. Summaries, flashcards, and quiz results already in your history are kept.`)) return;
    setDeleting(ws.id);
    try {
      await deleteWorkspace(ws.id);
      setList((l) => l?.filter((w) => w.id !== ws.id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t delete this workspace.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
      <p className="eyebrow mb-2">History</p>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">My Materials</h1>
      <p className="mt-1 text-sm text-muted">Course materials you imported from Brightspace, with what you’ve generated from them. Saved to your TrojanMind account only.</p>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-ink flex gap-2">
          <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" aria-hidden="true" /> {error}
        </div>
      )}

      {list === null ? (
        <div className="surface rounded-2xl p-8 mt-6 flex flex-col items-center gap-3" role="status">
          <div className="spinner" aria-hidden="true" />
          <p className="text-sm text-muted">Loading your saved materials…</p>
        </div>
      ) : list.length === 0 ? (
        <div className="surface rounded-2xl p-8 mt-6 text-center">
          <FolderOpen size={28} className="mx-auto text-muted mb-3" aria-hidden="true" />
          <p className="font-semibold text-ink">No saved materials yet</p>
          <p className="text-sm text-muted mt-1">Select items in a course on My Courses, then choose “Import selected materials”.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button type="button" onClick={onCourses} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">Go to My Courses</button>
            <button type="button" onClick={onUpload} className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold">
              <Upload size={14} aria-hidden="true" /> Upload or paste instead
            </button>
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 mt-6">
          {list.map((ws) => {
            const imported = ws.items.filter((i) => i.status === 'imported').length;
            return (
              <li key={ws.id} className="surface rounded-xl px-4 py-3 flex items-start gap-3 border-l-4 border-l-cardinal">
                <button type="button" onClick={() => onOpen(ws.id)} className="flex-1 min-w-0 text-left">
                  <span className="block font-bold text-ink break-words hover:text-cardinal">{ws.title}</span>
                  <span className="block text-xs text-muted mt-0.5 break-words">{ws.courseName}</span>
                  <span className="block text-xs text-muted mt-1">
                    {imported}/{ws.items.length} with text · {ws.outputs.summaryIds.length} summar{ws.outputs.summaryIds.length === 1 ? 'y' : 'ies'} ·{' '}
                    {ws.outputs.quizAttemptIds.length} quiz result{ws.outputs.quizAttemptIds.length === 1 ? '' : 's'} · updated {when(ws.updatedAt)}
                    {ws.importState !== 'complete' && <span className="text-warning"> · import {ws.importState === 'importing' ? 'incomplete' : 'interrupted'}</span>}
                  </span>
                </button>
                <button type="button" onClick={() => onOpen(ws.id)} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0">Open</button>
                <button
                  type="button"
                  onClick={() => void remove(ws)}
                  disabled={deleting !== null}
                  className="btn-secondary px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 text-danger"
                  aria-label={`Delete ${ws.title}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// ── Workspace view ──────────────────────────────────────────────────────────

type ActionId = 'summary' | 'practice' | 'challenge' | 'examPrep' | 'schedule';

const WorkspaceView: React.FC<MyMaterialsProps & { id: string }> = ({ id, onOpenWorkspace, onNavigate, onChallenge, onUpload }) => {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [texts, setTexts] = useState<Map<number, string>>(new Map());
  const [outputs, setOutputs] = useState<LinkedOutputs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [practiceDocId, setPracticeDocId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const setSummaryBridge = useStore((s) => s.setSummaryBridge);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const w = await getWorkspace(id);
      if (!w) {
        setLoadError('This workspace no longer exists, or it isn’t in your account.');
        return;
      }
      // Saved text and outputs only: nothing is re-imported or regenerated.
      const [t, o] = await Promise.all([loadWorkspaceTexts(id), syncLinkedOutputs(w).catch(() => null)]);
      setWs(w);
      setTexts(t);
      setOutputs(o);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Couldn’t load this workspace.');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const refreshOutputs = useCallback(async () => {
    const w = await getWorkspace(id);
    if (!w) return;
    setWs(w);
    setOutputs(await syncLinkedOutputs(w).catch(() => null));
  }, [id]);

  if (loadError) {
    return (
      <Page onBack={() => onOpenWorkspace(null)}>
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-6 text-sm text-ink">{loadError}</div>
      </Page>
    );
  }
  if (!ws) {
    return (
      <Page onBack={() => onOpenWorkspace(null)}>
        <div className="surface rounded-2xl p-8 flex flex-col items-center gap-3" role="status">
          <div className="spinner" aria-hidden="true" />
          <p className="text-sm text-muted">Opening saved workspace…</p>
        </div>
      </Page>
    );
  }

  const imported = ws.items.filter((i) => i.status === 'imported' && texts.has(i.index));
  const hasText = imported.length > 0;
  const hasQuiz = (outputs?.quizAttempts.length ?? 0) > 0;
  const missing = ws.items.filter((i) => i.status !== 'imported');

  /** Create (once) or reuse the study document, then run the action. Double clicks are ignored. */
  const withStudyDoc = async (action: ActionId, go: (documentId: string) => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setActionError(null);
    try {
      const { documentId, workspace } = await ensureStudyDocument(ws, texts);
      setWs(workspace);
      setSummaryBridge({ documentId, fileName: workspace.title });
      go(documentId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Couldn’t prepare this material for the learning tools.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const noText = 'Needs imported text. Upload or paste the material if nothing could be retrieved.';
  const noQuiz = 'Needs at least one completed practice quiz or reasoning challenge on this material.';
  const actions: { id: ActionId; label: string; icon: React.ElementType; enabled: boolean; why: string; run: () => void }[] = [
    { id: 'summary', label: 'Summarize', icon: FileText, enabled: hasText, why: noText,
      run: () => void withStudyDoc('summary', () => onNavigate(HOME_TABS.summary)) },
    { id: 'practice', label: 'Generate practice/quiz', icon: ListChecks, enabled: hasText, why: noText,
      run: () => void withStudyDoc('practice', (docId) => setPracticeDocId(docId)) },
    { id: 'challenge', label: 'Reasoning challenge', icon: Swords, enabled: hasText, why: noText,
      run: () => void withStudyDoc('challenge', (docId) => onChallenge(docId)) },
    { id: 'examPrep', label: 'Exam prep', icon: GraduationCap, enabled: hasQuiz, why: noQuiz,
      run: () => onNavigate(HOME_TABS.examPrep) },
    { id: 'schedule', label: 'Study schedule', icon: CalendarDays, enabled: hasQuiz, why: noQuiz,
      run: () => onNavigate(HOME_TABS.schedule) },
  ];

  return (
    <Page onBack={() => onOpenWorkspace(null)}>
      <p className="eyebrow mb-2">Saved workspace</p>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink break-words">{ws.title}</h1>
      <p className="mt-1 text-xs text-muted break-words">
        {ws.courseName}{ws.courseCode ? ` · ${ws.courseCode}` : ''} · created {when(ws.createdAt)} · updated {when(ws.updatedAt)}
      </p>

      {ws.importState !== 'complete' && (
        <div className="mt-4 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-ink flex gap-2">
          <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {ws.importState === 'importing'
              ? 'This import didn’t finish (the page may have been closed while it ran). Items without a result weren’t retrieved.'
              : `The import stopped early${ws.importError ? `: ${ws.importError}` : '.'} Items retrieved before that were kept.`}
          </span>
        </div>
      )}

      {/* Learning actions */}
      <section aria-labelledby="actions-title" className="surface rounded-2xl p-5 mt-6">
        <h2 id="actions-title" className="font-bold text-ink">Learn from these materials</h2>
        <p className="text-xs text-muted mt-1">
          Uses the {imported.length} item{imported.length === 1 ? '' : 's'} with imported text.
          {ws.studyDocumentTruncated && ` Only the first ${ws.studyDocumentChars.toLocaleString()} characters are used, to fit the study document size limit.`}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
          {actions.map((a) => (
            <div key={a.id}>
              <button
                type="button"
                onClick={a.run}
                disabled={!a.enabled || busy !== null}
                aria-describedby={!a.enabled ? `why-${a.id}` : undefined}
                className={`${a.id === 'summary' ? 'btn-primary' : 'btn-secondary'} w-full px-3 py-2.5 rounded-lg text-sm font-semibold justify-start`}
              >
                <a.icon size={15} aria-hidden="true" /> {busy === a.id ? 'Preparing…' : a.label}
              </button>
              {!a.enabled && <p id={`why-${a.id}`} className="text-[11px] text-muted mt-1">{a.why}</p>}
            </div>
          ))}
        </div>
        {actionError && <p role="alert" className="text-sm text-danger mt-3">{actionError}</p>}
      </section>

      {practiceDocId && (
        <section aria-label="Practice" className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-ink">Practice from this workspace</h2>
            <button type="button" onClick={() => { setPracticeDocId(null); void refreshOutputs(); }} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-semibold">
              Close practice
            </button>
          </div>
          <MaterialPractice initialDocumentId={practiceDocId} autoOpen />
        </section>
      )}

      {/* Saved outputs */}
      <section aria-labelledby="outputs-title" className="surface rounded-2xl p-5 mt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 id="outputs-title" className="font-bold text-ink">Saved outputs</h2>
          <button type="button" onClick={() => void refreshOutputs()} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-semibold">
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
        </div>
        {!outputs || (outputs.summaries.length + outputs.flashcardDecks.length + outputs.quizAttempts.length === 0) ? (
          <p className="text-sm text-muted mt-2">Nothing generated from this workspace yet. Summaries, flashcards, and quiz results appear here once you create them.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {outputs.summaries.map((s) => (
              <li key={s.id} className="py-2 flex items-center gap-2">
                <BookOpen size={15} className="text-cardinal shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0 text-ink">Summary{s.mode ? ` (${s.mode})` : ''} · <span className="text-muted">{when(s.createdAt)}</span></span>
                <button type="button" onClick={() => void withStudyDoc('summary', () => onNavigate(HOME_TABS.summary))} className="text-xs font-semibold text-cardinal hover:underline">View</button>
              </li>
            ))}
            {outputs.flashcardDecks.map((d) => (
              <li key={d.id} className="py-2 flex items-center gap-2">
                <Layers size={15} className="text-cardinal shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0 text-ink">Flashcards · {d.cardCount} cards · <span className="text-muted">{when(d.createdAt)}</span></span>
                <button type="button" onClick={() => void withStudyDoc('summary', () => onNavigate(HOME_TABS.summary))} className="text-xs font-semibold text-cardinal hover:underline">View</button>
              </li>
            ))}
            {outputs.quizAttempts.map((q) => (
              <li key={q.id} className="py-2 flex items-center gap-2">
                <Brain size={15} className="text-cardinal shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0 text-ink">Quiz · {q.accuracy}% of {q.totalQuestions} · <span className="text-muted">{when(q.createdAt)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Materials */}
      <section aria-labelledby="materials-title" className="mt-6">
        <h2 id="materials-title" className="font-bold text-ink mb-2">Materials ({ws.items.length})</h2>
        <ul className="grid gap-3">
          {ws.items.map((item) => <MaterialRow key={item.key} item={item} text={texts.get(item.index) ?? null} />)}
        </ul>
        {missing.length > 0 && (
          <div className="mt-4 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-sm text-ink flex flex-wrap items-center gap-3">
            <span className="flex-1 min-w-[12rem]">
              {missing.length} item{missing.length === 1 ? ' has' : 's have'} no imported text. Open the source, then upload or paste it to use it with TrojanMind.
            </span>
            <button type="button" onClick={onUpload} className="btn-secondary px-3 py-2 rounded-lg text-sm font-semibold">
              <Upload size={14} aria-hidden="true" /> Upload or paste instead
            </button>
          </div>
        )}
      </section>
    </Page>
  );
};

const PREVIEW_LIMIT = 1200;

const MaterialRow: React.FC<{ item: WorkspaceItem; text: string | null }> = ({ item, text }) => {
  const [open, setOpen] = useState(false);
  const has = item.status === 'imported' && text;
  const reason = item.reason === 'reference_only' ? LINK_ONLY_NOTE[item.sourceType] ?? IMPORT_REASON_TEXT.reference_only
    : item.reason ? IMPORT_REASON_TEXT[item.reason] ?? IMPORT_REASON_TEXT.unknown
    : item.status === 'pending' ? IMPORT_REASON_TEXT.interrupted : null;
  return (
    <li className="surface rounded-xl px-4 py-3">
      <div className="flex items-start gap-3">
        <ImportStatusIcon status={item.status === 'pending' ? 'failed' : item.status} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-ink break-words">{item.title}</p>
          {item.moduleTitle && <p className="text-xs text-muted break-words">{item.moduleTitle}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <SourceBadge type={item.sourceType} />
            <span className="text-xs text-muted">
              {item.status === 'imported'
                ? `Imported · ${item.charCount.toLocaleString()} characters${item.pages ? ` · ${item.pages} pages` : ''}${item.truncated ? ' · truncated by the connector' : ''}`
                : item.status === 'link_only' ? 'Link only' : 'Not retrieved'}
            </span>
          </div>
          {!has && reason && <p className="text-xs text-muted mt-1">{reason}</p>}
        </div>
        <SourceLink url={item.url} title={item.title} />
      </div>
      {has && (
        <div className="mt-3">
          <div className={`rounded-lg bg-sunken border border-line px-3 py-2 text-xs text-ink whitespace-pre-wrap break-words ${open ? 'max-h-[32rem] overflow-y-auto' : ''}`}>
            {open ? text : `${text.slice(0, PREVIEW_LIMIT)}${text.length > PREVIEW_LIMIT ? '…' : ''}`}
          </div>
          {text.length > PREVIEW_LIMIT && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-cardinal hover:underline" aria-expanded={open}>
              {open ? <><ChevronUp size={13} aria-hidden="true" /> Show less</> : <><ChevronDown size={13} aria-hidden="true" /> Show full text</>}
            </button>
          )}
        </div>
      )}
    </li>
  );
};

const Page: React.FC<{ onBack: () => void; children: React.ReactNode }> = ({ onBack, children }) => (
  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4">
      <ArrowLeft size={16} aria-hidden="true" /> Back to My Materials
    </button>
    {children}
  </div>
);

export default MyMaterials;
