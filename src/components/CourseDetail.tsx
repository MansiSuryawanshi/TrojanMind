import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Clock, Download, ExternalLink, EyeOff, FileText, Folder,
  FolderOpen, Globe, Info, Link2, Loader2, Lock, RefreshCw, Upload, Video, XCircle,
} from 'lucide-react';
import { useBrightspace } from '../brightspace/useBrightspace';
import type {
  ContentModule, ContentTopic, Course, CourseContent, CourseContentResult, SelectedMaterial, SourceType,
} from '../brightspace/brightspaceContext';
import { IMPORT_REASON_TEXT, LINK_ONLY_NOTE, SOURCE_TYPE_INFO, safeHttpUrl, topicsIn } from '../brightspace/contentApi';
import { useWorkspaceImport, type ImportRun } from '../hooks/useWorkspaceImport';
import type { WorkspaceItem } from '../services/workspaceService';

/** Mirrors server/materialImport.ts MAX_IMPORT_ITEMS. */
const MAX_IMPORT_ITEMS = 25;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; content: CourseContent }
  | { kind: 'failed'; result: Extract<CourseContentResult, { ok: false }> };

const SOURCE_ICON: Record<SourceType, React.ElementType> = {
  brightspace_file: FileText,
  brightspace_page: BookOpen,
  google_drive_folder: Folder,
  google_drive_file: FileText,
  google_doc: FileText,
  recording_lti: Video,
  external_link: Globe,
  unavailable: Link2,
};

const SOURCE_TONE: Record<SourceType, string> = {
  brightspace_file: 'bg-cardinal-soft text-cardinal border-cardinal/20',
  brightspace_page: 'bg-cardinal-soft text-cardinal border-cardinal/20',
  google_drive_folder: 'bg-warning-soft text-warning border-warning/25',
  google_drive_file: 'bg-info-soft text-info border-info/25',
  google_doc: 'bg-info-soft text-info border-info/25',
  recording_lti: 'bg-gold-soft text-gold-ink border-gold/50',
  external_link: 'bg-sunken text-muted border-line',
  unavailable: 'bg-sunken text-muted border-line',
};

export const SourceBadge: React.FC<{ type: SourceType }> = ({ type }) => {
  const Icon = SOURCE_ICON[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${SOURCE_TONE[type]}`}>
      <Icon size={12} aria-hidden="true" /> {SOURCE_TYPE_INFO[type].label}
    </span>
  );
};

/** Opens a source in a new tab. Renders nothing unless the URL is safe http(s). */
export const SourceLink: React.FC<{ url: string | null; title: string; compact?: boolean }> = ({ url, title, compact }) => {
  const href = safeHttpUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-cardinal hover:text-cardinal-hover hover:underline shrink-0"
      aria-label={`Open source for ${title} (opens in a new tab)`}
    >
      <ExternalLink size={13} aria-hidden="true" /> {compact ? 'Open' : 'Open source'}
    </a>
  );
};

function toMaterial(t: ContentTopic, moduleTitle: string): SelectedMaterial {
  return { key: t.key, title: t.title, sourceType: t.sourceType, url: t.url, sourceUrl: t.sourceUrl, moduleTitle, topicType: t.topicType, origin: t.origin };
}

const CourseDetail: React.FC<{
  course: Course;
  semesterLabel: string;
  onBack: () => void;
  onOpenWorkspace?: (id: string) => void;
  onUpload?: () => void;
}> = ({ course, semesterLabel, onBack, onOpenWorkspace, onUpload }) => {
  const { fetchCourseContent, selections, setCourseSelection, usedMaterials, saveUsedMaterials } = useBrightspace();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [view, setView] = useState<'browse' | 'review'>('browse');
  const topRef = useRef<HTMLDivElement>(null);

  const selection = useMemo(() => selections[course.id] ?? {}, [selections, course.id]);
  const selectedCount = Object.keys(selection).length;
  const used = usedMaterials[course.id];

  useEffect(() => {
    const controller = new AbortController();
    fetchCourseContent(course.id, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setLoad(result.ok ? { kind: 'ready', content: result.content } : { kind: 'failed', result });
      },
      () => undefined, // aborted
    );
    return () => controller.abort();
  }, [course.id, fetchCourseContent, attempt]);

  const retry = () => {
    setLoad({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  const setTopics = useCallback((items: SelectedMaterial[], checked: boolean) => {
    setCourseSelection(course.id, (prev) => {
      const next = { ...prev };
      for (const m of items) {
        if (checked) next[m.key] = m;
        else delete next[m.key];
      }
      return next;
    });
  }, [course.id, setCourseSelection]);

  const toggleModule = (id: number) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const allModuleIds = useMemo(() => {
    if (load.kind !== 'ready') return [];
    const ids: number[] = [];
    const walk = (ms: (ContentModule | ContentTopic)[]) => ms.forEach((m) => { if (m.kind === 'module') { ids.push(m.id); walk(m.children); } });
    walk(load.content.modules);
    return ids;
  }, [load]);
  const allExpanded = allModuleIds.length > 0 && allModuleIds.every((id) => expanded.has(id));

  const confirmSelection = () => {
    const items = Object.values(selection);
    if (items.length === 0) return;
    saveUsedMaterials(course.id, items);
    setView('review');
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={topRef} className="max-w-4xl mx-auto px-4 sm:px-6 py-10 animate-fade-in scroll-mt-20">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4">
        <ArrowLeft size={16} aria-hidden="true" /> Back to My Courses
      </button>

      <p className="eyebrow mb-2">Brightspace course</p>
      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gold-soft text-gold-ink text-[11px] font-bold mb-2">{semesterLabel}</span>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink break-words">{course.name}</h1>
      <p className="mt-1 text-xs text-muted">
        Code <span className="font-mono text-ink">{course.code ?? '—'}</span> · ID <span className="font-mono text-ink">{course.id}</span>
      </p>

      <div className="mt-6" aria-live="polite">
        {load.kind === 'loading' && (
          <div className="surface rounded-2xl p-8 flex flex-col items-center gap-3 text-center" role="status">
            <div className="spinner" aria-hidden="true" />
            <p className="font-semibold text-ink">Loading course content…</p>
            <p className="text-sm text-muted max-w-md">Reading this course's modules and topics from Brightspace through the local connector.</p>
          </div>
        )}

        {load.kind === 'failed' && <LoadError result={load.result} onRetry={retry} onBack={onBack} />}

        {load.kind === 'ready' && view === 'review' && used && (
          <ReviewPanel course={course} items={used.items} savedAt={used.savedAt} onEdit={() => setView('browse')} onOpenWorkspace={onOpenWorkspace} onUpload={onUpload} />
        )}

        {load.kind === 'ready' && view === 'browse' && (
          <>
            {load.content.notices.map((n) => (
              <div key={n} className="rounded-xl border border-info/25 bg-info-soft px-4 py-3 mb-4 text-sm text-ink flex gap-2">
                <Info size={16} className="text-info shrink-0 mt-0.5" aria-hidden="true" /> {n}
              </div>
            ))}

            {load.content.modules.length === 0 && load.content.looseTopics.length === 0 ? (
              <div className="surface rounded-2xl p-8 text-center">
                <BookOpen size={28} className="mx-auto text-muted mb-3" aria-hidden="true" />
                <p className="font-semibold text-ink">No course content yet</p>
                <p className="text-sm text-muted mt-1">Brightspace returned no modules or topics for this course.</p>
                <button type="button" onClick={retry} className="btn-secondary mt-4 px-4 py-2 rounded-lg text-sm font-semibold">
                  <RefreshCw size={14} aria-hidden="true" /> Check again
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-xs text-muted">
                    {load.content.moduleCount} module{load.content.moduleCount === 1 ? '' : 's'} · {load.content.topicCount} item{load.content.topicCount === 1 ? '' : 's'} · retrieved{' '}
                    {new Date(load.content.retrievedAt).toLocaleTimeString()}
                  </p>
                  <div className="flex gap-2">
                    {allModuleIds.length > 0 && (
                      <button type="button" onClick={() => setExpanded(allExpanded ? new Set() : new Set(allModuleIds))} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-semibold">
                        {allExpanded ? 'Collapse all' : 'Expand all'}
                      </button>
                    )}
                    <button type="button" onClick={retry} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-semibold">
                      <RefreshCw size={13} aria-hidden="true" /> Refresh
                    </button>
                  </div>
                </div>

                {load.content.looseTopics.length > 0 && (
                  <div className="surface rounded-xl mb-3">
                    <TopicList topics={load.content.looseTopics} moduleTitle="Course content" selection={selection} onSet={setTopics} />
                  </div>
                )}

                <ul className="grid gap-3">
                  {load.content.modules.map((m) => (
                    <ModuleSection key={m.id} module={m} depth={0} expanded={expanded} onToggle={toggleModule} selection={selection} onSet={setTopics} />
                  ))}
                </ul>
              </>
            )}

            {/* Selection bar */}
            <div className="sticky bottom-4 mt-6 z-10">
              <div className="surface rounded-2xl shadow-raised px-4 py-3 flex flex-wrap items-center gap-3 border border-line-strong">
                <p className="text-sm font-semibold text-ink flex-1 min-w-[10rem]" aria-live="polite">
                  {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
                </p>
                {selectedCount > 0 && (
                  <button type="button" onClick={() => setCourseSelection(course.id, () => ({}))} className="btn-secondary px-3 py-2 rounded-lg text-sm font-semibold">
                    Clear
                  </button>
                )}
                {used && (
                  <button type="button" onClick={() => setView('review')} className="btn-secondary px-3 py-2 rounded-lg text-sm font-semibold">
                    View last review
                  </button>
                )}
                <button type="button" onClick={confirmSelection} disabled={selectedCount === 0} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
                  Use selected materials
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Tree ────────────────────────────────────────────────────────────────────

type SetTopics = (items: SelectedMaterial[], checked: boolean) => void;

const ModuleSection: React.FC<{
  module: ContentModule;
  depth: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  selection: Record<string, SelectedMaterial>;
  onSet: SetTopics;
}> = ({ module: m, depth, expanded, onToggle, selection, onSet }) => {
  const isOpen = expanded.has(m.id);
  const all = useMemo(() => topicsIn(m), [m]);
  const selectedHere = all.filter((t) => selection[t.key]).length;
  const allChecked = all.length > 0 && selectedHere === all.length;
  const someChecked = selectedHere > 0 && !allChecked;
  const boxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = someChecked;
  }, [someChecked]);

  const directTopics = m.children.filter((c): c is ContentTopic => c.kind === 'topic');
  const subModules = m.children.filter((c): c is ContentModule => c.kind === 'module');
  const bodyId = `module-${m.id}`;

  // Items in nested modules get their own module title in the review.
  const selectAll = (checked: boolean) => {
    const items: SelectedMaterial[] = [];
    const walk = (mod: ContentModule) => mod.children.forEach((c) => (c.kind === 'topic' ? items.push(toMaterial(c, mod.title)) : walk(c)));
    walk(m);
    onSet(items, checked);
  };

  return (
    <li className={depth === 0 ? 'surface rounded-xl overflow-hidden' : 'border-t border-line'}>
      <div className={`flex items-center gap-2 px-3 sm:px-4 py-3 ${depth === 0 ? 'border-l-4 border-l-cardinal' : 'pl-6 sm:pl-8 bg-sunken/50'}`}>
        <button
          type="button"
          onClick={() => onToggle(m.id)}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronRight size={18} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
          {isOpen ? <FolderOpen size={18} className="shrink-0 text-cardinal" aria-hidden="true" /> : <Folder size={18} className="shrink-0 text-cardinal" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="font-bold text-ink break-words">{m.title}</span>
            <span className="block text-xs text-muted">
              {m.childrenUnavailable ? 'Contents couldn’t be read' : `${all.length} item${all.length === 1 ? '' : 's'}`}
              {selectedHere > 0 && ` · ${selectedHere} selected`}
            </span>
          </span>
        </button>
        <ModuleFlags m={m} />
        {all.length > 0 && (
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted shrink-0 cursor-pointer select-none">
            <input
              ref={boxRef}
              type="checkbox"
              className="w-4 h-4 accent-cardinal cursor-pointer"
              checked={allChecked}
              onChange={(e) => selectAll(e.target.checked)}
              aria-label={`Select all items in ${m.title}`}
            />
            <span className="hidden sm:inline">Select all</span>
          </label>
        )}
      </div>

      {isOpen && (
        <div id={bodyId}>
          {m.description && (
            <p className="px-4 sm:px-6 pb-3 text-sm text-muted whitespace-pre-line break-words">{m.description}</p>
          )}
          {m.availabilityMessage && <p className="px-4 sm:px-6 pb-3 text-xs text-warning">{m.availabilityMessage}</p>}
          {m.childrenUnavailable && (
            <div className="mx-4 mb-3 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-ink flex gap-2">
              <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
              {m.childrenUnavailable}
            </div>
          )}
          {!m.childrenUnavailable && m.children.length === 0 && (
            <p className="px-4 sm:px-6 pb-4 text-sm text-muted italic">This module has no items.</p>
          )}
          {directTopics.length > 0 && <TopicList topics={directTopics} moduleTitle={m.title} selection={selection} onSet={onSet} indent={depth} />}
          {subModules.length > 0 && (
            <ul>
              {subModules.map((s) => (
                <ModuleSection key={s.id} module={s} depth={depth + 1} expanded={expanded} onToggle={onToggle} selection={selection} onSet={onSet} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};

const ModuleFlags: React.FC<{ m: ContentModule }> = ({ m }) => (
  <span className="hidden sm:flex gap-1 shrink-0">
    {m.isHidden && <Flag icon={EyeOff} label="Hidden" />}
    {m.isLocked && <Flag icon={Lock} label="Locked" />}
    {!m.isAvailable && <Flag icon={Clock} label="Not available" />}
  </span>
);

const Flag: React.FC<{ icon: React.ElementType; label: string }> = ({ icon: Icon, label }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-line bg-sunken text-[10px] font-semibold text-muted">
    <Icon size={11} aria-hidden="true" /> {label}
  </span>
);

const TopicList: React.FC<{
  topics: ContentTopic[];
  moduleTitle: string;
  selection: Record<string, SelectedMaterial>;
  onSet: SetTopics;
  indent?: number;
}> = ({ topics, moduleTitle, selection, onSet, indent = 0 }) => (
  <ul className="border-t border-line divide-y divide-line">
    {topics.map((t) => {
      const checked = Boolean(selection[t.key]);
      const inputId = `topic-${t.key}`;
      return (
        <li key={t.key} className={`flex items-start gap-3 py-3 pr-4 ${checked ? 'bg-cardinal-soft/40' : ''}`} style={{ paddingLeft: `${1.25 + indent * 1.25}rem` }}>
          <input
            id={inputId}
            type="checkbox"
            className="w-4 h-4 mt-0.5 accent-cardinal cursor-pointer shrink-0"
            checked={checked}
            onChange={(e) => onSet([toMaterial(t, moduleTitle)], e.target.checked)}
          />
          <div className="flex-1 min-w-0">
            <label htmlFor={inputId} className="font-semibold text-sm text-ink break-words cursor-pointer">{t.title}</label>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <SourceBadge type={t.sourceType} />
              {t.isHidden && <Flag icon={EyeOff} label="Hidden" />}
              {t.isLocked && <Flag icon={Lock} label="Locked" />}
              {!t.isAvailable && <Flag icon={Clock} label="Not available" />}
              {t.origin === 'module_description' && <span className="text-[11px] text-muted">Linked in module description</span>}
            </div>
            {t.description && <p className="mt-1 text-xs text-muted break-words line-clamp-3">{t.description}</p>}
            {t.availabilityMessage && <p className="mt-1 text-xs text-warning">{t.availabilityMessage}</p>}
          </div>
          <SourceLink url={t.url} title={t.title} compact />
        </li>
      );
    })}
  </ul>
);

// ── Review ──────────────────────────────────────────────────────────────────

const REVIEW_ORDER: SourceType[] = [
  'brightspace_file', 'brightspace_page', 'google_doc', 'google_drive_file', 'google_drive_folder', 'recording_lti', 'external_link', 'unavailable',
];

const RETRIEVABLE: ReadonlySet<SourceType> = new Set(['brightspace_file', 'brightspace_page', 'google_doc', 'google_drive_file', 'google_drive_folder']);

const ReviewPanel: React.FC<{
  course: Course;
  items: SelectedMaterial[];
  savedAt: string;
  onEdit: () => void;
  onOpenWorkspace?: (id: string) => void;
  onUpload?: () => void;
}> = ({ course, items, savedAt, onEdit, onOpenWorkspace, onUpload }) => {
  const { run, start, busy } = useWorkspaceImport();
  const groups = REVIEW_ORDER
    .map((type) => ({ type, items: items.filter((i) => i.sourceType === type) }))
    .filter((g) => g.items.length > 0);
  const retrievable = items.filter((i) => RETRIEVABLE.has(i.sourceType)).length;
  const tooMany = items.length > MAX_IMPORT_ITEMS;

  if (run.phase === 'running' || run.phase === 'done') {
    return <ImportProgressPanel run={run} onOpenWorkspace={onOpenWorkspace} onEdit={onEdit} onUpload={onUpload} />;
  }

  return (
    <section aria-labelledby="review-title" className="grid gap-4">
      <div className="rounded-2xl border border-gold/60 bg-gold-soft p-5">
        <h2 id="review-title" className="font-bold text-gold-ink text-lg">Selected references ({items.length})</h2>
        <p className="text-sm text-ink mt-1 leading-relaxed">
          These are <strong>links to your selected course materials</strong>. Nothing has been read from them yet.
          <strong> Import selected materials</strong> retrieves readable text for Brightspace-hosted files and pages and for link-shared Google Docs, Drive files, and Drive folders
          ({retrievable} of {items.length} selected) and saves everything to <strong>My Materials</strong>. Recordings
          and external links are saved as links only.
        </p>
        <p className="text-xs text-muted mt-2">Selected {new Date(savedAt).toLocaleTimeString()}</p>
      </div>

      {run.phase === 'failed' && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-ink flex gap-2">
          <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" aria-hidden="true" /> {run.error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void start(course, items)}
          disabled={busy || tooMany}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold"
        >
          <Download size={14} aria-hidden="true" /> Import selected materials
        </button>
        <button type="button" onClick={onEdit} className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold">
          <ArrowLeft size={14} aria-hidden="true" /> Edit selection
        </button>
        {tooMany && <span className="text-xs text-warning">Select at most {MAX_IMPORT_ITEMS} items per import.</span>}
      </div>

      {groups.map((g) => (
        <div key={g.type} className="surface rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2">
            <SourceBadge type={g.type} />
            <span className="text-xs font-semibold text-muted">{g.items.length} item{g.items.length === 1 ? '' : 's'}</span>
            <span className="text-xs text-muted basis-full">{SOURCE_TYPE_INFO[g.type].note}</span>
          </div>
          <ul className="divide-y divide-line">
            {g.items.map((i) => (
              <li key={i.key} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-ink break-words">{i.title}</p>
                  <p className="text-xs text-muted break-words">{i.moduleTitle}</p>
                </div>
                {safeHttpUrl(i.url)
                  ? <SourceLink url={i.url} title={i.title} />
                  : <span className="text-xs text-muted shrink-0">No safe link</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
};

/** Per-item import progress, then a summary with a link to the saved workspace. */
const ImportProgressPanel: React.FC<{
  run: Extract<ImportRun, { phase: 'running' | 'done' }>;
  onOpenWorkspace?: (id: string) => void;
  onEdit: () => void;
  onUpload?: () => void;
}> = ({ run, onOpenWorkspace, onEdit, onUpload }) => {
  const imported = run.items.filter((i) => i.status === 'imported').length;
  const linkOnly = run.items.filter((i) => i.status === 'link_only').length;
  const failed = run.items.filter((i) => i.status === 'failed').length;
  const done = run.phase === 'done';
  return (
    <section aria-labelledby="import-title" className="grid gap-4">
      <div className={`rounded-2xl border p-5 ${done ? 'border-success/30 bg-success-soft' : 'border-gold/60 bg-gold-soft'}`}>
        <h2 id="import-title" className="font-bold text-ink text-lg">
          {done ? 'Import finished' : `Importing ${run.items.length} item${run.items.length === 1 ? '' : 's'}…`}
        </h2>
        <p className="text-sm text-ink mt-1" aria-live="polite">
          {imported} imported · {linkOnly} saved as link only · {failed} not retrieved
          {!done && ' · each result is saved as it arrives'}
        </p>
        {run.error && (
          <p className="text-sm text-danger mt-2 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> {run.error} Items finished before this were kept.</p>
        )}
      </div>

      <ul className="surface rounded-xl divide-y divide-line overflow-hidden">
        {run.items.map((i) => (
          <li key={i.key} className="px-4 py-3 flex items-start gap-3">
            <ImportStatusIcon status={i.status} active={!done && run.currentIndex === i.index} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-ink break-words">{i.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <SourceBadge type={i.sourceType} />
                {i.status === 'imported' && (
                  <span className="text-xs text-muted">
                    {i.charCount.toLocaleString()} characters{i.pages ? ` · ${i.pages} pages` : ''}{i.truncated ? ' · truncated by the connector' : ''}
                  </span>
                )}
              </div>
              {(i.status === 'link_only' || i.status === 'failed') && i.reason && (
                <p className="text-xs text-muted mt-1">
                  {i.reason === 'reference_only' ? LINK_ONLY_NOTE[i.sourceType] ?? IMPORT_REASON_TEXT.reference_only : IMPORT_REASON_TEXT[i.reason] ?? IMPORT_REASON_TEXT.unknown}
                </p>
              )}
            </div>
            <SourceLink url={i.url} title={i.title} compact />
          </li>
        ))}
      </ul>

      {done && (
        <div className="flex flex-wrap gap-2">
          {onOpenWorkspace && (
            <button type="button" onClick={() => onOpenWorkspace(run.workspaceId)} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
              <FolderOpen size={14} aria-hidden="true" /> Open workspace
            </button>
          )}
          {(linkOnly > 0 || failed > 0) && onUpload && (
            <button type="button" onClick={onUpload} className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold">
              <Upload size={14} aria-hidden="true" /> Upload or paste instead
            </button>
          )}
          <button type="button" onClick={onEdit} className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold">
            <ArrowLeft size={14} aria-hidden="true" /> Back to course content
          </button>
        </div>
      )}
    </section>
  );
};

export const ImportStatusIcon: React.FC<{ status: WorkspaceItem['status']; active?: boolean }> = ({ status, active }) => {
  if (status === 'pending') {
    return active
      ? <Loader2 size={18} className="shrink-0 mt-0.5 text-gold-ink animate-spin" aria-label="Importing" />
      : <Clock size={18} className="shrink-0 mt-0.5 text-muted" aria-label="Waiting" />;
  }
  if (status === 'imported') return <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-success" aria-label="Imported" />;
  if (status === 'link_only') return <Link2 size={18} className="shrink-0 mt-0.5 text-info" aria-label="Link only" />;
  return <XCircle size={18} className="shrink-0 mt-0.5 text-danger" aria-label="Not retrieved" />;
};

// ── Errors ──────────────────────────────────────────────────────────────────

const LoadError: React.FC<{ result: Extract<CourseContentResult, { ok: false }>; onRetry: () => void; onBack: () => void }> = ({ result, onRetry, onBack }) => {
  if (result.kind === 'action_required' || result.kind === 'pending') {
    return (
      <div role="status" className="rounded-2xl border border-gold/60 bg-gold-soft p-6">
        <p className="font-bold text-gold-ink">{result.kind === 'action_required' ? 'Action needed to reach Brightspace' : 'Still connecting to Brightspace'}</p>
        <p className="text-sm text-ink mt-1 leading-relaxed break-words">{result.message}</p>
        <button type="button" onClick={onRetry} className="btn-primary mt-4 px-4 py-2 rounded-lg text-sm font-semibold">Check again</button>
      </div>
    );
  }

  let title = 'Couldn’t load course content';
  let detail: React.ReactNode = result.message;
  let canRetry = true;
  if (result.code === 'unreachable') {
    title = 'Local connector not running';
    detail = <>Start it with <code className="font-mono text-ink">npm run server</code>, then try again.</>;
  } else if (result.code === 'not_found') {
    // The connector answered but has no such route: it predates this feature.
    title = 'Local connector needs a restart';
    detail = <>The running connector is an older version without course content support. Stop it and run <code className="font-mono text-ink">npm run server</code> (or <code className="font-mono text-ink">npm run dev</code>) again.</>;
  } else if (result.code === 'not_owner') {
    title = 'Brightspace not available for this account';
    canRetry = false;
  } else if (result.code === 'course_not_found' || result.code === 'course_no_access') {
    title = 'Course not available';
  } else if (result.code === 'invalid_course_id') {
    canRetry = false;
  }

  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-danger">{title}</p>
          <p className="text-sm text-ink mt-1 leading-relaxed break-words">{detail}</p>
          <div className="flex gap-2 mt-4">
            {canRetry && <button type="button" onClick={onRetry} className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold">Try again</button>}
            <button type="button" onClick={onBack} className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold">Back to My Courses</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;
