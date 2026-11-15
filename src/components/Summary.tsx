import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Layers,
  Loader2,
  MessageSquare,
  RotateCcw,
  Save,
  Shuffle,
  Sparkles,
  CalendarPlus,
  ClipboardList,
  Info,
} from 'lucide-react';
import type { StudyDocument } from '../types';
import type {
  SummaryMode,
  SummaryRecord,
  StructuredSummary,
  SummaryProgress,
  ConceptCard,
  Flashcard,
  ChatMessage,
  FlashcardDeck,
  CourseInfoItem,
} from '../types/summary';
import {
  listUserDocuments,
  listSummariesForDocument,
  saveSummaryRecord,
  getChatForDocument,
  saveChatSession,
  clearChatForDocument,
  saveFlashcardDeck,
  listFlashcardDecks,
  updateFlashcardDeck,
  saveRevisionTask,
  markDocumentProcessed,
} from '../services/firebaseService';
import { parsePagedText } from '../services/pdfService';
import {
  generateDocumentSummary,
  askDocumentQuestion,
  extractConceptsFromSummary,
  generateFlashcardsFromMaterial,
  summaryToMarkdown,
  downloadTextFile,
  openPrintableSummary,
} from '../services/summaryService';
import { useStore } from '../store/store';
import {
  ADMIN_ONLY_MESSAGE,
  buildSummaryView,
  isAdministrativeLabel,
  isAdministrativeOnlyError,
} from '../services/contentClassification';
import {
  suggestSchedulePlacement,
  type ScheduleSuggestion,
} from '../services/scheduleSuggest';

type InnerTab =
  | 'overview'
  | 'detailed'
  | 'concepts'
  | 'definitions'
  | 'ask'
  | 'flashcards'
  | 'exam_notes'
  | 'original';

const MODE_OPTIONS: { id: SummaryMode; label: string; hint: string }[] = [
  { id: 'detailed', label: 'Detailed Summary', hint: 'Every concept explained, with source pages' },
  { id: 'quick', label: 'Quick Summary', hint: 'A short overview and the main takeaways' },
  { id: 'exam_revision', label: 'Exam Revision Summary', hint: 'Definitions, formulas and likely exam focus' },
  { id: 'explain_simply', label: 'Explain Simply', hint: 'Plain-language explanations' },
];

interface SummaryProps {
  onGoToExamPrep: () => void;
  onGoToSchedule: () => void;
  onGoToUpload: () => void;
}

export const Summary: React.FC<SummaryProps> = ({
  onGoToExamPrep,
  onGoToSchedule,
  onGoToUpload,
}) => {
  const setSummaryBridge = useStore((s) => s.setSummaryBridge);
  const addRevisionTaskLocal = useStore((s) => s.addRevisionTaskLocal);
  const topicProgress = useStore((s) => s.topicProgress);
  const revisionTasks = useStore((s) => s.revisionTasks);
  const daysLeft = useStore((s) => s.daysLeft);
  const examDate = useStore((s) => s.examDate);

  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [savedSummaries, setSavedSummaries] = useState<SummaryRecord[]>([]);
  const [mode, setMode] = useState<SummaryMode>('detailed');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<SummaryProgress | null>(null);
  const [activeSummary, setActiveSummary] = useState<StructuredSummary | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [complete, setComplete] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [innerTab, setInnerTab] = useState<InnerTab>('overview');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Concepts
  const [concepts, setConcepts] = useState<ConceptCard[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);

  // Chat
  const [chatId, setChatId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [allowGeneralKnowledge, setAllowGeneralKnowledge] = useState(false);

  // Flashcards
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [flashLoading, setFlashLoading] = useState(false);

  // Schedule modal
  const [scheduleTopic, setScheduleTopic] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleMins, setScheduleMins] = useState(45);
  const [scheduleAfter, setScheduleAfter] = useState<string | null>(null);
  const [scheduleNext, setScheduleNext] = useState<string | null>(null);
  const [scheduleFocus, setScheduleFocus] = useState('');
  const [scheduleReason, setScheduleReason] = useState('');
  const [scheduleSuggestion, setScheduleSuggestion] = useState<ScheduleSuggestion | null>(null);

  const selected = useMemo(
    () => documents.find((d) => d.id === selectedId) || null,
    [documents, selectedId]
  );

  const pages = useMemo(
    () => (selected ? parsePagedText(selected.rawText || '') : []),
    [selected]
  );

  // Academic content vs course information; also applied to older saved summaries.
  const view = useMemo(() => (activeSummary ? buildSummaryView(activeSummary) : null), [activeSummary]);
  const adminOnly = view?.kind === 'administrative';
  const [flashNotice, setFlashNotice] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const docs = await listUserDocuments();
      setDocuments(docs);
      if (docs.length && !selectedId) {
        // Opened from a saved workspace (or a previous visit): keep that document.
        const preferred = useStore.getState().summaryBridge.documentId;
        setSelectedId(preferred && docs.some((d) => d.id === preferred) ? preferred : docs[0].id || '');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents');
    } finally {
      setLoadingDocs(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setActiveSummary(null);
      setActiveRecordId(null);
      setConcepts([]);
      setDeck(null);
      setMessages([]);
      setChatId(undefined);
      try {
        const [sums, chat, decks] = await Promise.all([
          listSummariesForDocument(selectedId),
          getChatForDocument(selectedId),
          listFlashcardDecks(selectedId),
        ]);
        if (cancelled) return;
        setSavedSummaries(sums);
        if (sums[0]) {
          setActiveSummary(sums[0].summary);
          setActiveRecordId(sums[0].id || null);
          setMode(sums[0].mode);
          setComplete(sums[0].complete);
          setSummaryBridge({
            documentId: selectedId,
            fileName: sums[0].fileName,
            summaryReviewedCount: 1,
          });
        }
        if (chat) {
          setChatId(chat.id);
          setMessages(chat.messages || []);
        }
        if (decks[0]) {
          setDeck(decks[0]);
          setCardIndex(0);
          setFlipped(false);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed loading saved summary data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, setSummaryBridge]);

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    setError(null);
    setProgress({ stage: 'start', current: 0, total: 1, message: 'Starting…' });
    try {
      const result = await generateDocumentSummary(selected, mode, setProgress);
      setActiveSummary(result.summary);
      setComplete(result.complete);
      setInnerTab('overview');
      setSummaryBridge({
        documentId: selected.id || null,
        fileName: selected.fileName,
        summaryReviewedCount: 1,
      });

      setSaving(true);
      const id = await saveSummaryRecord({
        documentId: selected.id!,
        fileName: selected.fileName,
        mode,
        summary: result.summary,
        chunkCount: result.chunkCount,
        pagesCovered: result.pagesCovered,
        pagesFailed: result.pagesFailed,
        complete: result.complete,
      });
      setActiveRecordId(id);
      if (selected.id) await markDocumentProcessed(selected.id);
      const sums = await listSummariesForDocument(selected.id!);
      setSavedSummaries(sums);
      setSaveMsg('Summary saved');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e: any) {
      setError(e?.message || 'Summary generation failed');
    } finally {
      setGenerating(false);
      setSaving(false);
      setProgress(null);
    }
  };

  const reopenSummary = (record: SummaryRecord) => {
    setActiveSummary(record.summary);
    setActiveRecordId(record.id || null);
    setMode(record.mode);
    setComplete(record.complete);
    setInnerTab('overview');
  };

  const handleCopy = async () => {
    if (!activeSummary || !selected) return;
    const md = summaryToMarkdown(selected.fileName, mode, activeSummary);
    await navigator.clipboard.writeText(md);
    setSaveMsg('Copied to clipboard');
    setTimeout(() => setSaveMsg(null), 2000);
  };

  const handleDownload = () => {
    if (!activeSummary || !selected) return;
    const md = summaryToMarkdown(selected.fileName, mode, activeSummary);
    downloadTextFile(`${selected.fileName.replace(/\.[^.]+$/, '')}-summary.md`, md);
  };

  const handlePrintPdf = () => {
    if (!activeSummary || !selected) return;
    const md = summaryToMarkdown(selected.fileName, mode, activeSummary);
    openPrintableSummary(`Summary — ${selected.fileName}`, md);
  };

  const handleSaveAgain = async () => {
    if (!selected || !activeSummary) return;
    setSaving(true);
    try {
      const id = await saveSummaryRecord({
        documentId: selected.id!,
        fileName: selected.fileName,
        mode,
        summary: activeSummary,
        chunkCount: savedSummaries[0]?.chunkCount ?? 0,
        pagesCovered: savedSummaries[0]?.pagesCovered ?? [],
        pagesFailed: savedSummaries[0]?.pagesFailed ?? [],
        complete,
      });
      setActiveRecordId(id);
      setSavedSummaries(await listSummariesForDocument(selected.id!));
      setSaveMsg('Summary saved');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const loadConcepts = async () => {
    if (!activeSummary || !selected) return;
    setConceptsLoading(true);
    setError(null);
    try {
      const cards = await extractConceptsFromSummary(activeSummary, selected);
      setConcepts(cards);
      if (!cards.length) {
        setError('This summary doesn’t explain any course concepts yet, so there’s nothing to list here.');
      }
    } catch (e: any) {
      setError(e?.message || 'Concept extraction failed');
    } finally {
      setConceptsLoading(false);
    }
  };

  useEffect(() => {
    if (innerTab === 'concepts' && activeSummary && !adminOnly && concepts.length === 0 && !conceptsLoading) {
      void loadConcepts();
    }
  }, [innerTab, activeSummary, adminOnly]);

  const sendChat = async (text?: string) => {
    const q = (text ?? chatInput).trim();
    if (!q || !selected || chatLoading) return;
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: q,
      createdAt: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setChatInput('');
    setChatLoading(true);
    try {
      const result = await askDocumentQuestion(selected, q, messages, {
        allowGeneralKnowledge,
      });
      const assistant: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        sourcePages: result.sourcePages,
        followUps: result.followUps,
        usedGeneralKnowledge: result.usedGeneralKnowledge,
        createdAt: new Date().toISOString(),
      };
      const withReply = [...next, assistant];
      setMessages(withReply);
      const id = await saveChatSession(selected.id!, withReply, chatId);
      setChatId(id);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `Error: ${e?.message || 'Could not answer'}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const clearChat = async () => {
    if (!selected?.id) return;
    await clearChatForDocument(selected.id);
    setMessages([]);
    setChatId(undefined);
  };

  const makeFlashcards = async () => {
    if (!selected) return;
    setFlashLoading(true);
    setFlashNotice(null);
    try {
      const cards = await generateFlashcardsFromMaterial(selected, activeSummary, 12);
      const deckId = await saveFlashcardDeck({
        documentId: selected.id!,
        fileName: selected.fileName,
        cards,
      });
      setDeck({ id: deckId, documentId: selected.id!, fileName: selected.fileName, cards, createdAt: null });
      setCardIndex(0);
      setFlipped(false);
      setInnerTab('flashcards');
      setSummaryBridge({ flashcardsReviewedCount: cards.length });
    } catch (e: any) {
      if (isAdministrativeOnlyError(e)) setFlashNotice(ADMIN_ONLY_MESSAGE);
      else setError(e?.message || 'Flashcard generation failed');
    } finally {
      setFlashLoading(false);
    }
  };

  const updateCard = async (patch: Partial<Flashcard>) => {
    if (!deck?.cards?.length) return;
    const cards = deck.cards.map((c, i) => (i === cardIndex ? { ...c, ...patch } : c));
    setDeck({ ...deck, cards });
    if (deck.id) await updateFlashcardDeck(deck.id, cards);
  };

  const shuffleCards = () => {
    if (!deck) return;
    const cards = [...deck.cards].sort(() => Math.random() - 0.5);
    setDeck({ ...deck, cards });
    setCardIndex(0);
    setFlipped(false);
  };

  const openScheduleModal = (topic: string) => {
    // Course policies stay in Course information; they aren't study sessions.
    if (isAdministrativeLabel(topic)) return;
    const suggestion = suggestSchedulePlacement({
      topic,
      summary: activeSummary,
      topicProgress,
      revisionTasks,
      daysLeft,
      examDate,
      fileName: selected?.fileName,
    });
    setScheduleTopic(topic);
    setScheduleSuggestion(suggestion);
    setScheduleDate(suggestion.date);
    setScheduleMins(suggestion.durationMinutes);
    setScheduleAfter(suggestion.afterTopic);
    setScheduleNext(suggestion.nextTopic);
    setScheduleFocus(suggestion.studyFocus);
    setScheduleReason(suggestion.reason);
  };

  const applySuggestionDefaults = () => {
    if (!scheduleSuggestion) return;
    setScheduleDate(scheduleSuggestion.date);
    setScheduleMins(scheduleSuggestion.durationMinutes);
    setScheduleAfter(scheduleSuggestion.afterTopic);
    setScheduleNext(scheduleSuggestion.nextTopic);
    setScheduleFocus(scheduleSuggestion.studyFocus);
    setScheduleReason(scheduleSuggestion.reason);
  };

  const closeScheduleModal = () => {
    setScheduleTopic(null);
    setScheduleSuggestion(null);
  };

  const addTopicToSchedule = async () => {
    if (!scheduleTopic || !scheduleDate || !selected) return;
    const task = {
      topic: scheduleTopic,
      documentId: selected.id,
      fileName: selected.fileName,
      date: scheduleDate,
      durationMinutes: scheduleMins,
      source: 'summary' as const,
      afterTopic: scheduleAfter,
      nextTopic: scheduleNext,
      studyFocus: scheduleFocus || null,
      suggestionReason: scheduleReason || null,
    };
    const id = await saveRevisionTask(task);
    addRevisionTaskLocal({ ...task, id, createdAt: null });
    closeScheduleModal();
    setSaveMsg('Added to your Study Schedule');
    setTimeout(() => setSaveMsg(null), 2000);
    onGoToSchedule();
  };

  const goPractice = () => {
    if (!selected) return;
    setSummaryBridge({
      documentId: selected.id || null,
      fileName: selected.fileName,
      openMaterialPractice: false,
    });
    onGoToExamPrep();
  };

  const innerTabs: { id: InnerTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'detailed', label: 'Detailed Summary' },
    { id: 'concepts', label: 'Concepts' },
    { id: 'definitions', label: 'Definitions & Formulas' },
    { id: 'ask', label: 'Ask AI' },
    { id: 'flashcards', label: 'Flashcards' },
    { id: 'exam_notes', label: 'Exam Notes' },
    { id: 'original', label: 'Original Text' },
  ];

  if (loadingDocs) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cardinal" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-10 max-w-6xl animate-fade-in">
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter mb-2">
          AI <span className="text-cardinal">Summary</span>
        </h1>
        <p className="text-muted font-medium">
          Choose a material to see what it teaches, then practice its key concepts. Deadlines, grading and other course
          rules are listed separately.
        </p>
      </div>

      {/* Document selector */}
      <div className="surface rounded-2xl border border-line p-6 md:p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="text-xs font-bold uppercase tracking-widest text-muted mb-2 block">
              Your materials
            </label>
            {documents.length === 0 ? (
              <div className="text-muted">
                No materials yet.{' '}
                <button onClick={onGoToUpload} className="text-cardinal underline">
                  Add material
                </button>
              </div>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full bg-sunken border border-line rounded-2xl px-4 py-3 text-ink focus:outline-none focus:border-cardinal"
              >
                {documents.map((d) => (
                  <option key={d.id} value={d.id} className="bg-surface text-ink">
                    {d.fileName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {selected && (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-sunken border border-line p-4">
              <div className="text-xs text-muted font-bold uppercase">Title</div>
              <div className="font-semibold truncate">{selected.fileName}</div>
            </div>
            <div className="rounded-2xl bg-sunken border border-line p-4">
              <div className="text-xs text-muted font-bold uppercase">Pages</div>
              <div className="font-semibold">{selected.pageCount || pages.length || '—'}</div>
            </div>
            <div className="rounded-2xl bg-sunken border border-line p-4">
              <div className="text-xs text-muted font-bold uppercase">Processed</div>
              <div className="font-semibold flex items-center gap-2">
                {selected.processed || activeSummary ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Yes
                  </>
                ) : (
                  'Not summarized yet'
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-sunken border border-line p-4">
              <div className="text-xs text-muted font-bold uppercase">Text size</div>
              <div className="font-semibold">{(selected.rawText?.length || 0).toLocaleString()} chars</div>
            </div>
          </div>
        )}

        {selected?.scannedPages && selected.scannedPages.length > 0 && (
          <p className="mt-4 text-sm rounded-xl border border-warning/30 bg-warning-soft text-warning px-4 py-3 font-medium">
            Pages {selected.scannedPages.join(', ')} have little readable text (they may be scans or diagrams), so they
            can’t be summarized.
          </p>
        )}

        {savedSummaries.length > 0 && (
          <div className="mt-5">
            <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
              Saved summaries (open one to view it again)
            </div>
            <div className="flex flex-wrap gap-2">
              {savedSummaries.map((s) => (
                <button
                  key={s.id}
                  onClick={() => reopenSummary(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                    activeRecordId === s.id
                      ? 'bg-cardinal-soft border-cardinal text-ink'
                      : 'border-line text-ink/80 hover:border-cardinal/50'
                  }`}
                >
                  {MODE_OPTIONS.find((m) => m.id === s.mode)?.label || s.mode}
                  {!s.complete ? ' (partial)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mode + generate */}
      {selected && (
        <div className="surface rounded-2xl border border-line p-6 md:p-8 mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">
            Summary style
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`text-left rounded-2xl p-4 border transition ${
                  mode === m.id
                    ? 'border-cardinal bg-cardinal-soft'
                    : 'border-line bg-sunken hover:border-line-strong'
                }`}
              >
                <div className="font-bold text-sm">{m.label}</div>
                <div className="text-xs text-muted mt-1">{m.hint}</div>
              </button>
            ))}
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !selected.rawText?.trim()}
            className="btn-primary px-8 py-3.5 rounded-full text-ink font-bold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" /> Generate Summary
              </>
            )}
          </button>
          <p className="text-xs text-muted mt-3">
            Creates a {MODE_OPTIONS.find((m) => m.id === mode)?.label.toLowerCase() || 'summary'} of the concepts this
            material explains and saves it, so you can reopen it later without generating it again.
          </p>

          {progress && (
            <div className="mt-5">
              <div className="flex justify-between text-xs text-muted mb-2">
                <span>{progress.message}</span>
                <span>
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="h-2 rounded-full bg-sunken overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cardinal to-cardinal transition-all"
                  style={{
                    width: `${Math.max(8, (progress.current / Math.max(progress.total, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200 text-sm">
          {error}
        </div>
      )}
      {saveMsg && (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-emerald-200 text-sm">
          {saveMsg}
        </div>
      )}

      {/* Results */}
      {activeSummary && selected && (
        <>
          {!complete && (
            <div className="mb-4 rounded-2xl border border-warning/30 bg-warning-soft px-5 py-3 text-warning text-sm font-medium">
              Some pages couldn’t be summarized, so parts of this document may be missing. See the notes at the end of the
              Overview, or generate the summary again.
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
            {innerTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setInnerTab(t.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition ${
                  innerTab === t.id
                    ? 'bg-gradient-to-r from-cardinal to-cardinal text-ink'
                    : 'bg-sunken text-ink/80 hover:bg-sunken'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="surface-raised rounded-2xl border border-line p-6 md:p-8 mb-8 min-h-[320px]">
            {innerTab === 'overview' && view && (
              <div className="space-y-8">
                {adminOnly ? (
                  <section className="rounded-2xl border border-info/25 bg-info-soft px-5 py-4">
                    <h2 className="text-lg font-extrabold mb-1 flex items-center gap-2 text-ink">
                      <Info className="w-5 h-5 text-info" /> No study topics in this document
                    </h2>
                    <p className="text-ink leading-relaxed">{ADMIN_ONLY_MESSAGE}</p>
                    <p className="text-sm text-muted mt-2">
                      The course information is below. Practice quizzes and your study plan skip it unless you choose
                      “Quiz me on course policies” in Challenge or Exam Prep.
                    </p>
                    <button
                      onClick={onGoToUpload}
                      className="btn-primary mt-4 px-4 py-2 rounded-full text-sm font-bold"
                    >
                      Add lecture slides or notes
                    </button>
                  </section>
                ) : (
                  <>
                    <section>
                      <h2 className="text-xl font-extrabold mb-3 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-cardinal" /> What this material teaches
                      </h2>
                      <p className="text-ink leading-relaxed">{view.overview}</p>
                    </section>

                    {view.academicTopics.length > 0 && (
                      <section>
                        <h3 className="font-bold text-ink mb-3">Core concepts</h3>
                        <ul className="space-y-3">
                          {view.academicTopics.slice(0, 8).map((t) => (
                            <li key={t.title} className="rounded-xl border border-line bg-sunken px-4 py-3">
                              <div className="font-semibold text-ink">{t.title}</div>
                              {t.explanation && (
                                <p className="text-sm text-ink/80 mt-1 leading-relaxed line-clamp-3">{t.explanation}</p>
                              )}
                              {t.sourcePages?.length > 0 && (
                                <p className="text-xs text-cardinal mt-1">Source: Page {t.sourcePages.join(', ')}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                        {view.academicTopics.length > 8 && (
                          <button onClick={() => setInnerTab('detailed')} className="mt-2 text-xs font-bold text-cardinal hover:underline">
                            See all {view.academicTopics.length} topics in Detailed Summary
                          </button>
                        )}
                      </section>
                    )}

                    {view.takeaways.length > 0 && (
                      <section>
                        <h3 className="font-bold text-ink mb-2">Key takeaways</h3>
                        <ul className="list-disc pl-5 space-y-1 text-ink">
                          {view.takeaways.slice(0, 6).map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {view.examples.length > 0 && (
                      <section>
                        <h3 className="font-bold text-ink mb-2">Examples from the material</h3>
                        <ul className="space-y-2 text-sm text-ink">
                          {view.examples.map((ex) => (
                            <li key={`${ex.topic}-${ex.text}`}>
                              <span className="font-semibold">{ex.topic}:</span> {ex.text}
                              {ex.sourcePages.length > 0 && (
                                <span className="text-xs text-cardinal"> (p. {ex.sourcePages.join(', ')})</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {view.practiceNext.length > 0 && (
                      <section>
                        <h3 className="font-bold text-ink mb-2">What to practice next</h3>
                        <ul className="list-disc pl-5 space-y-1 text-ink">
                          {view.practiceNext.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button onClick={goPractice} className="btn-secondary px-4 py-2 rounded-full text-xs font-bold">
                            Practice in Exam Prep
                          </button>
                          <button onClick={() => setInnerTab('flashcards')} className="btn-secondary px-4 py-2 rounded-full text-xs font-bold">
                            Review with flashcards
                          </button>
                        </div>
                      </section>
                    )}
                  </>
                )}

                {view.courseInfo.length > 0 && <CourseInfoSection items={view.courseInfo} defaultOpen={adminOnly} />}

                {view.coverageNotes.length > 0 && (
                  <section className="text-sm rounded-xl border border-warning/30 bg-warning-soft text-warning px-4 py-3 font-medium">
                    <h3 className="font-bold mb-1 text-ink">Not fully covered</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {view.coverageNotes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {innerTab === 'detailed' && view && (
              <div className="space-y-8">
                <h2 className="text-xl font-extrabold">Topic-by-topic summary</h2>
                {view.academicTopics.length === 0 && (
                  <p className="text-muted">{ADMIN_ONLY_MESSAGE}</p>
                )}
                {view.academicTopics.map((t) => (
                  <article key={t.title} className="rounded-2xl border border-line bg-sunken p-5">
                    <h3 className="text-lg font-bold text-cardinal mb-2">{t.title}</h3>
                    <p className="text-ink leading-relaxed whitespace-pre-wrap mb-3">{t.explanation}</p>
                    {t.subtopics?.length > 0 && (
                      <p className="text-sm text-muted mb-1">
                        <span className="font-semibold text-ink/80">Subtopics:</span> {t.subtopics.join(' · ')}
                      </p>
                    )}
                    {t.definitions?.length > 0 && (
                      <p className="text-sm text-muted mb-1">
                        <span className="font-semibold text-ink/80">Definitions:</span> {t.definitions.join(' · ')}
                      </p>
                    )}
                    {t.formulas?.length > 0 && (
                      <p className="text-sm text-info/90 mb-1 font-mono">
                        {t.formulas.join(' · ')}
                      </p>
                    )}
                    {t.procedures?.length > 0 && (
                      <p className="text-sm text-muted mb-1">
                        <span className="font-semibold text-ink/80">Procedures:</span> {t.procedures.join(' · ')}
                      </p>
                    )}
                    {t.examples?.length > 0 && (
                      <p className="text-sm text-muted mb-1">
                        <span className="font-semibold text-ink/80">Examples:</span> {t.examples.join(' · ')}
                      </p>
                    )}
                    {t.relationships?.length > 0 && (
                      <p className="text-sm text-muted mb-1">
                        <span className="font-semibold text-ink/80">Relationships:</span> {t.relationships.join(' · ')}
                      </p>
                    )}
                    {t.sourcePages?.length > 0 && (
                      <p className="text-xs text-cardinal mt-3">Source: Page {t.sourcePages.join(', ')}</p>
                    )}
                    <button
                      onClick={() => openScheduleModal(t.title)}
                      className="mt-3 text-xs font-bold text-info hover:text-info inline-flex items-center gap-1"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" /> Add to Study Schedule
                    </button>
                  </article>
                ))}

                {view.courseInfo.length > 0 && <CourseInfoSection items={view.courseInfo} defaultOpen />}

                {activeSummary.conceptRelationships.some((r) => !isAdministrativeLabel(r.from) && !isAdministrativeLabel(r.to)) && (
                <section>
                  <h3 className="font-bold mb-2">How the concepts connect</h3>
                  <ul className="space-y-1 text-sm text-ink/80">
                    {activeSummary.conceptRelationships
                      .filter((r) => !isAdministrativeLabel(r.from) && !isAdministrativeLabel(r.to))
                      .map((r, i) => (
                      <li key={i}>
                        {r.from} → {r.to}: {r.relationship}
                      </li>
                    ))}
                  </ul>
                </section>
                )}

                <section>
                  <h3 className="font-bold mb-2">Source references</h3>
                  <ul className="space-y-2 text-sm text-ink/80">
                    {activeSummary.sourceReferences.map((s, i) => (
                      <li key={i}>
                        “{s.claim}” <span className="text-cardinal">Source: Page {s.page}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {innerTab === 'concepts' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-extrabold flex items-center gap-2">
                    <Layers className="w-5 h-5 text-cardinal" /> Concept Explorer
                  </h2>
                  {!adminOnly && (
                    <button
                      onClick={loadConcepts}
                      disabled={conceptsLoading}
                      className="btn-secondary px-4 py-2 rounded-full text-sm font-bold"
                    >
                      {conceptsLoading ? 'Loading…' : 'Refresh Concepts'}
                    </button>
                  )}
                </div>
                {adminOnly && <p className="text-muted">{ADMIN_ONLY_MESSAGE}</p>}
                {conceptsLoading && concepts.length === 0 && (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-cardinal" />
                  </div>
                )}
                <div className="space-y-3">
                  {concepts.map((c) => (
                    <div key={c.id} className="rounded-2xl border border-line overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-sunken"
                        onClick={() => setExpandedConcept(expandedConcept === c.id ? null : c.id)}
                      >
                        <div>
                          <div className="font-bold">{c.name}</div>
                          <div className="text-sm text-muted">{c.shortDescription}</div>
                        </div>
                        <ChevronDown
                          className={`w-5 h-5 transition ${expandedConcept === c.id ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {expandedConcept === c.id && (
                        <div className="px-5 pb-5 border-t border-line pt-4 space-y-3 text-sm text-ink">
                          <p className="leading-relaxed">{c.detailedExplanation}</p>
                          {c.definitions?.length > 0 && (
                            <p>
                              <span className="font-semibold">Definitions:</span> {c.definitions.join('; ')}
                            </p>
                          )}
                          {c.example && (
                            <p>
                              <span className="font-semibold">Example:</span> {c.example}
                            </p>
                          )}
                          {c.relatedConcepts?.length > 0 && (
                            <p>
                              <span className="font-semibold">Related:</span> {c.relatedConcepts.join(', ')}
                            </p>
                          )}
                          {c.sourcePages?.length > 0 && (
                            <p className="text-cardinal text-xs">Source: Page {c.sourcePages.join(', ')}</p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-2">
                            <button
                              className="px-3 py-1.5 rounded-full bg-sunken text-xs font-bold"
                              onClick={() => {
                                setInnerTab('ask');
                                setChatInput(`Explain "${c.name}" more simply`);
                              }}
                            >
                              Explain Simply
                            </button>
                            <button
                              className="px-3 py-1.5 rounded-full bg-sunken text-xs font-bold"
                              onClick={() => {
                                setInnerTab('ask');
                                setChatInput(`What should I know about ${c.name}?`);
                              }}
                            >
                              Ask a Question
                            </button>
                            <button
                              className="px-3 py-1.5 rounded-full bg-sunken text-xs font-bold"
                              onClick={goPractice}
                            >
                              Practice in Exam Prep
                            </button>
                            <button
                              className="px-3 py-1.5 rounded-full bg-sunken text-xs font-bold"
                              onClick={() => openScheduleModal(c.name)}
                            >
                              Add to Study Plan
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {innerTab === 'definitions' && (
              <div>
                <h2 className="text-xl font-extrabold mb-4">Definitions and Formulas</h2>
                <div className="space-y-3">
                  {(view?.definitionsAndFormulas || []).map((d, i) => (
                    <div key={i} className="rounded-2xl border border-line bg-sunken p-4">
                      <div className="font-bold text-cardinal">{d.term}</div>
                      <div className="text-ink mt-1">{d.definition}</div>
                      {d.formula && (
                        <div className="mt-2 font-mono text-info text-sm">{d.formula}</div>
                      )}
                      {d.sourcePages?.length > 0 && (
                        <div className="text-xs text-cardinal mt-2">Source: Page {d.sourcePages.join(', ')}</div>
                      )}
                    </div>
                  ))}
                  {(view?.definitionsAndFormulas.length ?? 0) === 0 && (
                    <p className="text-muted">This summary doesn’t include any definitions or formulas.</p>
                  )}
                </div>
              </div>
            )}

            {innerTab === 'ask' && (
              <div className="flex flex-col h-[560px]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-extrabold flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-cardinal" /> Ask StudyBuddy
                  </h2>
                  <button onClick={clearChat} className="text-xs font-bold text-muted hover:text-ink">
                    Clear conversation
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted mb-3">
                  <input
                    type="checkbox"
                    checked={allowGeneralKnowledge}
                    onChange={(e) => setAllowGeneralKnowledge(e.target.checked)}
                  />
                  Explain using general knowledge if not found in the document (explicitly labeled)
                </label>
                <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                  {messages.length === 0 && (
                    <div className="text-sm text-muted space-y-2">
                      <p>Ask anything about this document. Answers use original extracted text, not only the summary.</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          'What are the main topics?',
                          'Explain the concept on page 1',
                          'Give me an example from the material',
                          'Which formulas should I memorize?',
                        ].map((s) => (
                          <button
                            key={s}
                            onClick={() => void sendChat(s)}
                            className="px-3 py-1.5 rounded-full bg-sunken border border-line text-xs hover:border-cardinal/40"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-cardinal-soft border border-cardinal/30 ml-8'
                          : 'bg-sunken border border-line mr-8'
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-widest text-muted mb-1 font-bold">
                        {m.role === 'user' ? 'You' : 'StudyBuddy'}
                      </div>
                      <div className="whitespace-pre-wrap text-ink">{m.content}</div>
                      {m.sourcePages && m.sourcePages.length > 0 && (
                        <div className="text-xs text-cardinal mt-2">
                          Sources: Page {m.sourcePages.join(', ')}
                        </div>
                      )}
                      {m.usedGeneralKnowledge && (
                        <div className="text-xs text-warning mt-1 font-semibold">Includes labeled general knowledge</div>
                      )}
                      {m.followUps && m.followUps.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {m.followUps.map((f) => (
                            <button
                              key={f}
                              onClick={() => void sendChat(f)}
                              className="px-2.5 py-1 rounded-full bg-sunken text-[11px] font-semibold hover:bg-cardinal-soft"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex items-center gap-2 text-muted text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Thinking with your document…
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void sendChat()}
                    placeholder="Ask about this material…"
                    className="flex-1 bg-sunken border border-line rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-cardinal"
                  />
                  <button
                    onClick={() => void sendChat()}
                    disabled={chatLoading || !chatInput.trim()}
                    className="btn-primary px-5 py-3 rounded-2xl font-bold text-sm disabled:opacity-50"
                  >
                    Ask
                  </button>
                </div>
              </div>
            )}

            {innerTab === 'flashcards' && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <h2 className="text-xl font-extrabold flex items-center gap-2">
                    <Brain className="w-5 h-5 text-cardinal" /> Flashcards
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={makeFlashcards}
                      disabled={flashLoading}
                      className="btn-primary px-4 py-2 rounded-full text-sm font-bold inline-flex items-center gap-2"
                    >
                      {flashLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Generate Flashcards
                    </button>
                    {deck && (
                      <button onClick={shuffleCards} className="btn-secondary px-3 py-2 rounded-full text-sm font-bold inline-flex items-center gap-1">
                        <Shuffle className="w-4 h-4" /> Shuffle
                      </button>
                    )}
                  </div>
                </div>

                {flashNotice && (
                  <p className="mb-4 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-sm text-ink">{flashNotice}</p>
                )}
                {!deck?.cards?.length ? (
                  !flashNotice && (
                    <p className="text-muted">
                      Generate Flashcards creates 12 question-and-answer cards from this material’s concepts and saves them
                      for later review.
                    </p>
                  )
                ) : (
                  <div
                    className="max-w-xl mx-auto -mx-2 px-2 py-4 rounded-2xl cursor-pointer select-none"
                    onClick={() => setFlipped((f) => !f)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setFlipped((f) => !f);
                      }
                    }}
                    aria-label={flipped ? 'Flip card to show prompt' : 'Flip card to show answer'}
                  >
                    <div className="flashcard-scene mb-4">
                      <div className={`flashcard-pivot ${flipped ? 'is-flipped' : ''}`}>
                        <div className="flashcard-face front">
                          <div className="text-[10px] uppercase tracking-widest text-muted mb-3 font-bold">
                            Prompt · Card {cardIndex + 1}/{deck.cards.length}
                          </div>
                          <div className="text-lg font-semibold leading-relaxed text-ink">
                            {deck.cards[cardIndex].front}
                          </div>
                          <div className="text-xs text-muted mt-4">Tap to flip</div>
                        </div>
                        <div className="flashcard-face back">
                          <div className="text-[10px] uppercase tracking-widest text-muted mb-3 font-bold">
                            Answer · Card {cardIndex + 1}/{deck.cards.length}
                          </div>
                          <div className="text-lg font-semibold leading-relaxed text-ink">
                            {deck.cards[cardIndex].back}
                          </div>
                          {deck.cards[cardIndex].sourcePage && (
                            <div className="text-xs text-cardinal mt-3">
                              Source: Page {deck.cards[cardIndex].sourcePage}
                            </div>
                          )}
                          <div className="text-xs text-muted mt-4">Tap to flip back</div>
                        </div>
                      </div>
                    </div>
                    <div
                      className="flex items-center justify-between gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFlipped(false);
                          setCardIndex((i) => Math.max(0, i - 1));
                        }}
                        className="btn-secondary px-3 py-2 rounded-full"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void updateCard({ known: true, needsReview: false })}
                          className="px-3 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold"
                        >
                          Known
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateCard({ needsReview: true, known: false })}
                          className="px-3 py-2 rounded-full bg-amber-500/20 border border-amber-500/30 text-xs font-bold"
                        >
                          Needs review
                        </button>
                        <button
                          type="button"
                          onClick={() => setFlipped((f) => !f)}
                          className="px-3 py-2 rounded-full bg-sunken text-xs font-bold inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Flip
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFlipped(false);
                          setCardIndex((i) => Math.min(deck.cards.length - 1, i + 1));
                        }}
                        className="btn-secondary px-3 py-2 rounded-full"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {innerTab === 'exam_notes' && (
              <div className="space-y-6">
                <h2 className="text-xl font-extrabold">Exam revision notes</h2>
                {(view?.examRevisionNotes.length ?? 0) === 0 && (
                  <p className="text-muted">{adminOnly ? ADMIN_ONLY_MESSAGE : 'No revision notes in this summary.'}</p>
                )}
                <ul className="list-disc pl-5 space-y-2 text-ink">
                  {(view?.examRevisionNotes || []).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                {(view?.topicsToReview.length ?? 0) > 0 && (
                  <>
                    <h3 className="font-bold">Topics worth reviewing</h3>
                    <p className="text-xs text-muted mb-2">
                      Picked because the material emphasizes them, not because of your quiz results. Click one to add it
                      to your Study Schedule.
                    </p>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {(view?.topicsToReview || []).map((t) => (
                    <button
                      key={t}
                      onClick={() => openScheduleModal(t)}
                      className="px-3 py-1.5 rounded-full bg-sunken border border-line text-sm hover:border-cardinal/40"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {innerTab === 'original' && (
              <div>
                <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cardinal" /> Original text
                </h2>
                <p className="text-sm text-muted mb-4">
                  The text TrojanMind imported from this material, page by page. Scanned pages may be empty.
                </p>
                <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
                  {pages.map((p) => (
                    <div key={p.page} className="rounded-2xl border border-line p-4">
                      <div className="text-xs font-bold uppercase tracking-widest text-cardinal mb-2">
                        Page {p.page}
                        {p.isEmpty || p.likelyScanned ? ' · little or no readable text' : ''}
                      </div>
                      <pre className="whitespace-pre-wrap text-sm text-ink/80 font-sans">
                        {p.text || '[No readable text on this page]'}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="flex flex-wrap gap-3 mb-16">
            <button
              onClick={handleSaveAgain}
              disabled={saving}
              className="btn-primary px-5 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Save Summary
            </button>
            <button onClick={handleDownload} className="btn-secondary px-5 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> Download Markdown
            </button>
            <button onClick={handlePrintPdf} className="btn-secondary px-5 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> Download PDF (Print)
            </button>
            <button onClick={handleCopy} className="btn-secondary px-5 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2">
              <Copy className="w-4 h-4" /> Copy
            </button>
            {!adminOnly && (
              <button onClick={goPractice} className="btn-secondary px-5 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2">
                <Brain className="w-4 h-4" /> Practice in Exam Prep
              </button>
            )}
            {view && view.academicTopics.length > 0 && (
              <button
                onClick={() => openScheduleModal(view.academicTopics[0].title)}
                className="btn-secondary px-5 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2"
              >
                <CalendarPlus className="w-4 h-4" /> Add “{view.academicTopics[0].title}” to Schedule
              </button>
            )}
          </div>
        </>
      )}

      {/* Schedule modal — interactive coach */}
      {scheduleTopic && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div
            className="surface-raised rounded-2xl border border-line p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-labelledby="schedule-modal-title"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 id="schedule-modal-title" className="text-xl font-extrabold mb-1">
                  Add to Study Schedule
                </h3>
                <p className="text-sm text-muted">
                  Topic: <span className="text-ink font-semibold">{scheduleTopic}</span>
                </p>
              </div>
              {scheduleSuggestion && (
                <span
                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${
                    scheduleSuggestion.band === 'weak'
                      ? 'bg-danger-soft text-danger border-danger/25'
                      : scheduleSuggestion.band === 'moderate'
                        ? 'bg-warning-soft text-warning border-warning/25'
                        : scheduleSuggestion.band === 'strong'
                          ? 'bg-success-soft text-success border-success/25'
                          : 'bg-sunken text-muted border-line'
                  }`}
                >
                  {scheduleSuggestion.band === 'unknown' ? 'Not assessed' : `${scheduleSuggestion.priority} priority`}
                </span>
              )}
            </div>

            {scheduleReason && (
              <div className="mb-4 rounded-xl border border-line border-l-4 border-l-cardinal bg-sunken/80 px-3.5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cardinal mb-1 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Why this topic
                </p>
                <p className="text-sm text-ink leading-relaxed">{scheduleReason}</p>
                <button
                  type="button"
                  onClick={applySuggestionDefaults}
                  className="mt-2 text-xs font-bold text-cardinal hover:underline"
                >
                  Reset to the suggested day and time
                </button>
              </div>
            )}

            {scheduleFocus && (
              <div className="mb-4">
                <label className="text-xs font-bold uppercase text-muted">What to do in this session</label>
                <textarea
                  value={scheduleFocus}
                  onChange={(e) => setScheduleFocus(e.target.value)}
                  rows={2}
                  className="w-full mt-1 bg-sunken border border-line rounded-xl px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs font-bold uppercase text-muted">Do this after</label>
              <p className="text-[11px] text-muted mb-1.5">
                Sequence: finish the earlier topic first, then this one
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setScheduleAfter(null)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border ${
                    !scheduleAfter
                      ? 'border-cardinal bg-cardinal-soft text-cardinal'
                      : 'border-line bg-surface text-muted'
                  }`}
                >
                  Start with this
                </button>
                {scheduleSuggestion?.afterTopic && (
                  <button
                    type="button"
                    onClick={() => setScheduleAfter(scheduleSuggestion.afterTopic)}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border max-w-full truncate ${
                      scheduleAfter === scheduleSuggestion.afterTopic
                        ? 'border-cardinal bg-cardinal-soft text-cardinal'
                        : 'border-line bg-surface text-muted'
                    }`}
                  >
                    After: {scheduleSuggestion.afterTopic}
                  </button>
                )}
                {(activeSummary?.topics || [])
                  .map((t) => t.title)
                  .filter((t) => t && t !== scheduleTopic && t !== scheduleSuggestion?.afterTopic)
                  .slice(0, 4)
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setScheduleAfter(t)}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border max-w-[11rem] truncate ${
                        scheduleAfter === t
                          ? 'border-cardinal bg-cardinal-soft text-cardinal'
                          : 'border-line bg-surface text-muted'
                      }`}
                      title={t}
                    >
                      After: {t}
                    </button>
                  ))}
              </div>
              {scheduleAfter && (
                <p className="text-xs text-ink">
                  Plan: <strong>{scheduleAfter}</strong> → <strong>{scheduleTopic}</strong>
                  {scheduleNext ? (
                    <>
                      {' '}
                      → <strong>{scheduleNext}</strong>
                    </>
                  ) : null}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold uppercase text-muted">Suggested day</label>
              <div className="flex flex-wrap gap-2 mt-1.5 mb-2">
                {(scheduleSuggestion?.altDates || []).map((a) => (
                  <button
                    key={a.date}
                    type="button"
                    onClick={() => setScheduleDate(a.date)}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border ${
                      scheduleDate === a.date
                        ? 'border-cardinal bg-cardinal-soft text-cardinal'
                        : 'border-line bg-surface text-muted'
                    }`}
                  >
                    {a.label}
                    {a.date === scheduleSuggestion?.date ? ' · best' : ''}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={scheduleDate}
                min={new Date().toISOString().slice(0, 10)}
                max={scheduleSuggestion?.latestDate || examDate || undefined}
                onChange={(e) => {
                  let next = e.target.value;
                  const latest = scheduleSuggestion?.latestDate || examDate;
                  if (latest && next > latest) next = latest;
                  setScheduleDate(next);
                }}
                className="w-full bg-sunken border border-line rounded-xl px-3 py-2 text-sm"
              />
              {(scheduleSuggestion?.latestDate || examDate) && (
                <p className="text-[11px] text-muted mt-1.5">
                  Can only schedule through exam day (
                  {scheduleSuggestion?.latestDate || examDate}).
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="text-xs font-bold uppercase text-muted">Estimated time</label>
              <p className="text-[11px] text-muted mt-0.5">A rough estimate. Change it to fit your day.</p>
              <div className="flex flex-wrap gap-2 mt-1.5 mb-2">
                {(scheduleSuggestion?.altDurations || [25, 45, 60, 90]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setScheduleMins(m)}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border ${
                      scheduleMins === m
                        ? 'border-cardinal bg-cardinal-soft text-cardinal'
                        : 'border-line bg-surface text-muted'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={5}
                max={240}
                value={scheduleMins}
                onChange={(e) => setScheduleMins(Number(e.target.value) || 30)}
                className="w-full bg-sunken border border-line rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeScheduleModal}
                className="btn-secondary px-4 py-2 rounded-full text-sm font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void addTopicToSchedule()}
                disabled={!scheduleDate}
                className="btn-primary px-4 py-2 rounded-full text-sm font-bold disabled:opacity-50"
              >
                Add to Study Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Course logistics, kept available but outside academic practice. */
const CourseInfoSection: React.FC<{ items: CourseInfoItem[]; defaultOpen?: boolean }> = ({ items, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-line bg-sunken">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span>
          <span className="font-bold text-ink flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted" /> Course information
          </span>
          <span className="block text-xs text-muted mt-0.5">
            Deadlines, grading and course policies ({items.length}). Not included in practice or your study plan.
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-line pt-4">
          {items.map((c) => (
            <div key={c.title}>
              <div className="font-semibold text-ink text-sm">{c.title}</div>
              {c.details.length > 0 && (
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-sm text-ink/80">
                  {c.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
              {c.sourcePages.length > 0 && (
                <p className="text-xs text-cardinal mt-1">Source: Page {c.sourcePages.join(', ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default Summary;
