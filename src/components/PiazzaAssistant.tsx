/**
 * Floating right-side Piazza Assistant — notifications, discussions, Ask AI.
 * Mounted only inside authenticated App (never on login screens).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BookOpen,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useStore } from '../store/store';
import {
  connectPiazza,
  fetchPiazzaClasses,
  fetchPiazzaPosts,
  openPiazzaUrl,
  readPiazzaPosts,
} from '../services/piazzaApi';
import {
  listNotifications,
  listPiazzaMappings,
  loadPiazzaPreferences,
  loadSyncState,
  markNotificationSeen,
  matchPiazzaClassToStudy,
  savePiazzaPreferences,
  unseenNotificationCount,
  upsertPiazzaMapping,
} from '../services/piazzaFirebase';
import { syncPiazzaCourse } from '../services/piazzaSync';
import { askPiazzaQuestion } from '../services/piazzaAsk';
import type {
  PiazzaAskMessage,
  PiazzaClass,
  PiazzaNotification,
  PiazzaPostDetail,
  PiazzaPostSummary,
} from '../types/piazza';

type Tab = 'updates' | 'discussions' | 'ask';

const POLL_MS = 3 * 60 * 1000;

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function typeBadge(type: PiazzaNotification['notificationType']): string {
  switch (type) {
    case 'instructor_answer':
      return 'Instructor answer';
    case 'instructor_endorsed':
      return 'Endorsed answer';
    case 'announcement':
    case 'announcement_edit':
      return 'Announcement';
    case 'deadline_alert':
      return 'Deadline alert';
    case 'new_question':
      return 'New question';
    case 'new_answer':
      return 'New answer';
    default:
      return 'Discussion';
  }
}

const PiazzaAssistant: React.FC = () => {
  const studyCourse = useStore((s) => s.studyCourseContext);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('updates');
  const [classes, setClasses] = useState<PiazzaClass[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followCurrent, setFollowCurrent] = useState(true);
  const [pinnedManually, setPinnedManually] = useState(false);
  const [connLabel, setConnLabel] = useState('Not connected');
  const [connOk, setConnOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [notifications, setNotifications] = useState<PiazzaNotification[]>([]);
  const [posts, setPosts] = useState<PiazzaPostSummary[]>([]);
  const [coverageNote, setCoverageNote] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<PiazzaPostDetail | null>(null);
  const [askHistory, setAskHistory] = useState<PiazzaAskMessage[]>([]);
  const [askInput, setAskInput] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [mapHint, setMapHint] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const selected = useMemo(() => classes.find((c) => c.id === selectedId) ?? null, [classes, selectedId]);

  const refreshUnseen = useCallback(async (courseId: string | null) => {
    try {
      setUnseen(await unseenNotificationCount(courseId));
    } catch {
      /* ignore */
    }
  }, []);

  const loadNotifs = useCallback(async (courseId: string | null) => {
    try {
      setNotifications(await listNotifications(courseId, 50));
      await refreshUnseen(courseId);
    } catch {
      setNotifications([]);
    }
  }, [refreshUnseen]);

  const applyAutoCourse = useCallback(
    async (list: PiazzaClass[], follow: boolean, manual: boolean, currentSelected: string | null) => {
      if (!follow || manual) return currentSelected;
      const mappings = await listPiazzaMappings();
      const matched = matchPiazzaClassToStudy(
        list,
        studyCourse
          ? {
              brightspaceCourseId: studyCourse.brightspaceCourseId,
              courseCode: studyCourse.courseCode,
              courseName: studyCourse.courseName,
            }
          : null,
        mappings,
      );
      if (matched) {
        setMapHint(null);
        return matched;
      }
      if (studyCourse) {
        setMapHint(`No Piazza class matched “${studyCourse.courseCode || studyCourse.courseName}”. Select one or map it.`);
      }
      return currentSelected;
    },
    [studyCourse],
  );

  const bootstrap = useCallback(async () => {
    try {
      const prefs = await loadPiazzaPreferences();
      setFollowCurrent(prefs.followCurrentCourse);
      setPinnedManually(prefs.pinnedManually);
      setOpen(prefs.panelOpen);
      let list: PiazzaClass[] = [];
      try {
        list = await fetchPiazzaClasses();
        setClasses(list);
        setConnOk(true);
        setConnLabel('Connected');
      } catch {
        setConnOk(false);
        setConnLabel('Piazza sync unavailable');
      }
      let sel = prefs.selectedCourseId;
      sel = (await applyAutoCourse(list, prefs.followCurrentCourse, prefs.pinnedManually, sel)) ?? sel;
      if (!sel && list[0]) sel = list[0].id;
      setSelectedId(sel);
      if (sel) {
        const st = await loadSyncState(sel);
        setLastSynced(st.lastSuccessfulSync);
        await loadNotifs(sel);
      }
    } catch {
      setConnLabel('Piazza sync unavailable');
    }
  }, [applyAutoCourse, loadNotifs]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!followCurrent || pinnedManually || classes.length === 0) return;
    void (async () => {
      const next = await applyAutoCourse(classes, true, false, selectedId);
      if (next && next !== selectedId) {
        setSelectedId(next);
        await savePiazzaPreferences({ selectedCourseId: next, pinnedManually: false });
        await loadNotifs(next);
      }
    })();
  }, [studyCourse?.brightspaceCourseId, studyCourse?.courseCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSync = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setSyncMsg(null);
    const result = await syncPiazzaCourse(selected);
    setBusy(false);
    if (!result.ok) {
      setConnOk(false);
      setConnLabel('Piazza sync unavailable');
      setSyncMsg(result.error || 'Sync failed — not claiming an empty inbox.');
      return;
    }
    setConnOk(true);
    setConnLabel('Connected');
    setLastSynced(result.lastSuccessfulSync);
    setPosts(result.posts);
    setCoverageNote(result.coverageNote);
    setSyncMsg(result.created > 0 ? `${result.created} new update${result.created === 1 ? '' : 's'}` : 'Synced — no new changes');
    await loadNotifs(selected.id);
  }, [selected, loadNotifs]);

  useEffect(() => {
    if (!open || !selectedId) return;
    void runSync();
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      void runSync();
    }, POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [open, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setBusy(true);
    setSyncMsg(null);
    try {
      const result = await connectPiazza(false);
      if (result.state === 'pending') {
        setConnLabel('Waiting for Piazza login…');
        setConnOk(false);
        setSyncMsg(result.message);
        setBusy(false);
        return;
      }
      setClasses(result.classes);
      setConnOk(true);
      setConnLabel('Connected');
      const next =
        (await applyAutoCourse(result.classes, followCurrent, pinnedManually, selectedId)) ??
        result.classes[0]?.id ??
        null;
      setSelectedId(next);
      if (next) await savePiazzaPreferences({ selectedCourseId: next });
      setBusy(false);
      if (next) await runSync();
    } catch (e) {
      setBusy(false);
      setConnOk(false);
      setConnLabel('Piazza sync unavailable');
      setSyncMsg(e instanceof Error ? e.message : 'Connect failed');
    }
  };

  const selectCourse = async (id: string) => {
    setSelectedId(id);
    setPinnedManually(true);
    setFollowCurrent(false);
    setExpanded(null);
    await savePiazzaPreferences({
      selectedCourseId: id,
      pinnedManually: true,
      followCurrentCourse: false,
    });
    const st = await loadSyncState(id);
    setLastSynced(st.lastSuccessfulSync);
    await loadNotifs(id);
    const cls = classes.find((c) => c.id === id);
    if (cls && studyCourse) {
      await upsertPiazzaMapping({
        trojanMindCourseId: studyCourse.brightspaceCourseId,
        trojanMindCourseCode: studyCourse.courseCode,
        piazzaCourseId: id,
        courseName: cls.courseNumber ? `${cls.courseNumber} — ${cls.name}` : cls.name,
      });
      setMapHint(null);
    }
  };

  const toggleFollow = async () => {
    const next = !followCurrent;
    setFollowCurrent(next);
    setPinnedManually(!next);
    await savePiazzaPreferences({ followCurrentCourse: next, pinnedManually: !next });
    if (next) {
      const matched = await applyAutoCourse(classes, true, false, selectedId);
      if (matched) {
        setSelectedId(matched);
        await savePiazzaPreferences({ selectedCourseId: matched });
        await loadNotifs(matched);
      }
    }
  };

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    await savePiazzaPreferences({ panelOpen: next });
  };

  const loadDiscussions = async (q?: string) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const { posts: list, coverageNote: note } = await fetchPiazzaPosts(selectedId, {
        q: q?.trim() || undefined,
        limit: 40,
      });
      setPosts(list);
      setCoverageNote(note);
      setConnOk(true);
      setConnLabel('Connected');
    } catch (e) {
      setConnOk(false);
      setConnLabel('Piazza sync unavailable');
      setSyncMsg(e instanceof Error ? e.message : 'Could not load discussions');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && tab === 'discussions' && selectedId) void loadDiscussions(search);
  }, [tab, selectedId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPost = async (nr: number | null, id: string, url: string) => {
    if (!selectedId) {
      openPiazzaUrl(url);
      return;
    }
    try {
      const details = await readPiazzaPosts(selectedId, [nr ?? id]);
      if (details[0]) setExpanded(details[0]);
    } catch {
      openPiazzaUrl(url, selectedId);
    }
  };

  const onNotifClick = async (n: PiazzaNotification) => {
    if (!n.seenAt) {
      try {
        await markNotificationSeen(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, seenAt: new Date().toISOString() } : x)));
        await refreshUnseen(selectedId);
      } catch {
        /* ignore */
      }
    }
    openPiazzaUrl(n.verifiedSourceUrl, n.courseId);
  };

  const sendAsk = async () => {
    if (!selected || !askInput.trim() || askBusy) return;
    const q = askInput.trim();
    setAskInput('');
    const userMsg: PiazzaAskMessage = { role: 'user', content: q, at: new Date().toISOString() };
    setAskHistory((h) => [...h, userMsg]);
    setAskBusy(true);
    try {
      const label = selected.courseNumber ? `${selected.courseNumber} — ${selected.name}` : selected.name;
      const result = await askPiazzaQuestion(selected.id, label, q, askHistory);
      setAskHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setAskHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Ask AI failed.',
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setAskBusy(false);
    }
  };

  const badge = unseen > 0 ? (unseen > 9 ? '9+' : String(unseen)) : null;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            className={`piazza-fab${badge ? ' piazza-fab--alert' : ''}`}
            initial={{ opacity: 0, y: 18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
          >
            <div className="piazza-fab__hint" aria-hidden="true">
              {badge ? `${badge} new on Piazza` : 'Piazza is here'}
            </div>
            <div className="piazza-fab__shell">
              <motion.button
                type="button"
                className="piazza-fab__btn focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                onClick={() => void toggleOpen()}
                aria-label={badge ? `Piazza Assistant, ${badge} new notifications` : 'Open Piazza Assistant'}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <svg className="piazza-fab__pill-orbit" viewBox="0 0 200 56" preserveAspectRatio="none" aria-hidden="true">
                  <rect className="piazza-fab__pill-track" x="2" y="2" width="196" height="52" rx="26" ry="26" />
                  <rect className="piazza-fab__pill-arc" x="2" y="2" width="196" height="52" rx="26" ry="26" pathLength="100" />
                </svg>
                <span className="piazza-fab__mark" aria-hidden="true">
                  <svg className="piazza-fab__orbit" viewBox="0 0 48 48" aria-hidden="true">
                    <circle className="piazza-fab__orbit-track" cx="24" cy="24" r="21.5" />
                    <circle className="piazza-fab__orbit-arc" cx="24" cy="24" r="21.5" />
                  </svg>
                  <MessageCircle className="piazza-fab__mark-icon" strokeWidth={2.25} />
                </span>
                <span className="piazza-fab__copy">
                  <span className="piazza-fab__title inline-flex items-center gap-1">
                    Piazza
                    <Sparkles className="h-3 w-3 text-gold" aria-hidden />
                  </span>
                  <span className="piazza-fab__sub">{badge ? 'New notifications' : 'Ask · discuss · sync'}</span>
                </span>
                {badge && <span className="piazza-fab__badge">{badge}</span>}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
        <motion.aside
          className="fixed inset-x-0 bottom-0 top-16 z-[150] flex w-full flex-col border-l border-line bg-surface shadow-raised sm:inset-x-auto sm:right-0 sm:w-[400px]"
          role="dialog"
          aria-label="Piazza Assistant"
          initial={{ x: 28, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-ink">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-cardinal text-white" aria-hidden>
                  <MessageCircle className="h-4 w-4" />
                </span>
                Piazza Assistant
              </h2>
              <p className="mt-1 text-xs text-muted">
                <span className={connOk ? 'text-emerald-700' : 'text-cardinal'}>{connLabel}</span>
                {badge ? ` · ${badge} new` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggleOpen()}
              className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-ink"
              aria-label="Close Piazza Assistant"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="space-y-2 border-b border-line px-4 py-3">
            <label className="block text-xs font-medium text-muted" htmlFor="piazza-class">
              Select Piazza Class
            </label>
            <select
              id="piazza-class"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
              value={selectedId ?? ''}
              onChange={(e) => void selectCourse(e.target.value)}
            >
              <option value="" disabled>
                {classes.length ? 'Choose a class…' : 'Connect Piazza to load classes'}
              </option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseNumber ? `${c.courseNumber} — ${c.name}` : c.name}
                  {c.term ? ` (${c.term})` : ''}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5 text-muted">
                <input type="checkbox" checked={followCurrent} onChange={() => void toggleFollow()} />
                Follow current course
              </label>
              {!connOk && (
                <button type="button" className="btn-link text-xs" onClick={() => void handleConnect()}>
                  Connect Piazza
                </button>
              )}
            </div>
            {mapHint && <p className="text-xs text-cardinal">{mapHint}</p>}
          </div>

          <nav className="flex border-b border-line text-sm" aria-label="Piazza tabs">
            {([
              ['updates', 'New Notification', Bell],
              ['discussions', 'Discussions', BookOpen],
              ['ask', 'Ask AI', MessageCircle],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 ${
                  tab === id ? 'border-b-2 border-cardinal font-semibold text-cardinal' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {tab === 'updates' && (
              <div className="space-y-3">
                {notifications.length === 0 ? (
                  <p className="text-sm text-muted">
                    {connOk
                      ? 'No TrojanMind-detected updates yet. Sync establishes a baseline first, then tracks new changes.'
                      : 'Connect Piazza and sync to load updates.'}
                  </p>
                ) : (
                  notifications.map((n) => (
                    <article
                      key={n.id}
                      className={`rounded-xl border border-line p-3 ${n.seenAt ? 'bg-canvas' : 'bg-cardinal-soft/40'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-cardinal">
                          {typeBadge(n.notificationType)}
                        </span>
                        {!n.seenAt && <span className="h-2 w-2 rounded-full bg-cardinal" aria-label="Unseen" />}
                      </div>
                      <p className="mt-1 text-xs text-muted">{n.courseName}</p>
                      <h3 className="mt-1 text-sm font-semibold text-ink">{n.title}</h3>
                      <p className="mt-1 text-sm text-muted line-clamp-3">{n.excerpt}</p>
                      {n.authorRole === 'instructor' && (
                        <p className="mt-1 text-xs font-medium text-ink">Instructor (verified from post metadata)</p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted">{formatWhen(n.createdAt)}</span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-medium text-cardinal hover:underline"
                          onClick={() => void onNotifClick(n)}
                        >
                          View on Piazza <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}

            {tab === 'discussions' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void loadDiscussions(search);
                      }}
                      placeholder="Search discussions"
                      className="w-full rounded-lg border border-line bg-canvas py-2 pl-8 pr-3 text-sm"
                    />
                  </div>
                  <button type="button" className="btn-secondary px-3 text-sm" onClick={() => void loadDiscussions(search)}>
                    Go
                  </button>
                </div>
                {coverageNote && <p className="text-[11px] text-muted">{coverageNote}</p>}
                {expanded ? (
                  <div className="space-y-2 rounded-xl border border-line bg-canvas p-3">
                    <button type="button" className="text-xs text-cardinal" onClick={() => setExpanded(null)}>
                      ← Back to list
                    </button>
                    <h3 className="font-semibold text-ink">{expanded.subject}</h3>
                    <p className="whitespace-pre-wrap text-sm text-ink">{expanded.body || expanded.snippet}</p>
                    {expanded.answers.map((a, i) => (
                      <div key={i} className="rounded-lg border border-line bg-surface p-2 text-sm">
                        <p className="text-[10px] font-bold uppercase text-cardinal">
                          {a.type === 'instructor' ? 'Instructor answer' : 'Student answer'}
                          {a.endorsedByInstructor ? ' · instructor-endorsed' : ''}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-ink">{a.text}</p>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-cardinal"
                      onClick={() => openPiazzaUrl(expanded.url, selectedId ?? undefined)}
                    >
                      View on Piazza <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  posts.map((p) => (
                    <button
                      key={`${p.id}-${p.nr}`}
                      type="button"
                      className="w-full rounded-xl border border-line bg-canvas p-3 text-left hover:border-line-strong"
                      onClick={() => void openPost(p.nr, p.id, p.url)}
                    >
                      <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase text-muted">
                        {p.hasInstructorAnswer && <span className="text-cardinal">Instructor answered</span>}
                        {p.isAnnouncement && <span>Announcement</span>}
                        {p.unanswered && <span>Unanswered</span>}
                        {p.nr != null && <span>@{p.nr}</span>}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-ink">{p.subject}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{p.snippet}</p>
                      <p className="mt-1 text-[11px] text-muted">{formatWhen(p.modifiedAt)}</p>
                    </button>
                  ))
                )}
                {!busy && posts.length === 0 && (
                  <p className="text-sm text-muted">No discussions loaded yet for this class.</p>
                )}
              </div>
            )}

            {tab === 'ask' && (
              <div className="flex h-full min-h-[280px] flex-col">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                  {askHistory.length === 0 && (
                    <p className="text-sm text-muted">
                      Ask about discussions in the selected Piazza class. Answers cite authorized posts only.
                    </p>
                  )}
                  {askHistory.map((m, i) => (
                    <div
                      key={`${m.at}-${i}`}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        m.role === 'user' ? 'ml-6 bg-cardinal text-white' : 'mr-4 border border-line bg-canvas text-ink'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.sources && m.sources.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-white/20 pt-2 text-xs">
                          {m.sources.map((s, j) => (
                            <li key={j}>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 underline"
                                onClick={() => openPiazzaUrl(s.url, selectedId ?? undefined)}
                              >
                                {s.postNr != null ? `@${s.postNr}` : 'View post'}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {askBusy && (
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching authorized discussions…
                    </p>
                  )}
                </div>
                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <input
                    value={askInput}
                    onChange={(e) => setAskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendAsk();
                      }
                    }}
                    placeholder="Ask about this class…"
                    className="flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
                    disabled={!selected || askBusy}
                  />
                  <button
                    type="button"
                    className="btn-primary px-3"
                    onClick={() => void sendAsk()}
                    disabled={!selected || askBusy || !askInput.trim()}
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <footer className="space-y-1 border-t border-line px-4 py-3 text-xs text-muted">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-medium text-ink hover:bg-sunken disabled:opacity-50"
                onClick={() => void runSync()}
                disabled={busy || !selected}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync Now
              </button>
              <span>Last synced: {lastSynced ? formatWhen(lastSynced) : 'never'}</span>
            </div>
            {syncMsg && <p className="text-muted">{syncMsg}</p>}
            <p className="text-[10px] text-muted">
              Updates are TrojanMind sync detections, not official Piazza push notifications.
            </p>
          </footer>
        </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};

export default PiazzaAssistant;
