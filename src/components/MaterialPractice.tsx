import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Brain, AlertTriangle, CheckCircle2, BookX, RotateCcw } from 'lucide-react';
import type { StudyDocument, GeneratedQuestion } from '../types';
import type { MistakeEntry } from '../types/summary';
import {
  listUserDocuments,
  getDocumentById,
  saveQuizAttempt,
  saveMistake,
  listMistakes,
  updateMistake,
  saveRevisionTask,
} from '../services/firebaseService';
import { generatePracticeFromDocument } from '../services/summaryService';
import { evaluateShortAnswer } from '../services/claudeService';
import { useStore } from '../store/store';
import QuizQuestion from './QuizQuestion';

interface PracticeQuestion {
  id: string;
  type: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  sourceTopic?: string;
  sourcePage?: number;
}

type ArenaPhase = 'setup' | 'loading' | 'quiz' | 'results';

const TIME_PER_QUESTION = 60;

interface MaterialPracticeProps {
  initialDocumentId?: string | null;
  autoOpen?: boolean;
}

export const MaterialPractice: React.FC<MaterialPracticeProps> = ({
  initialDocumentId,
  autoOpen,
}) => {
  const setAllAttempts = useStore((s) => s.setAllAttempts);
  const allAttempts = useStore((s) => s.allAttempts);
  const setSummaryBridge = useStore((s) => s.setSummaryBridge);
  const addRevisionTaskLocal = useStore((s) => s.addRevisionTaskLocal);
  const setWeakAreas = useStore((s) => s.setWeakAreas);
  const weakAreas = useStore((s) => s.weakAreas);

  const [docs, setDocs] = useState<StudyDocument[]>([]);
  const [docId, setDocId] = useState(initialDocumentId || '');
  const [topicsInput, setTopicsInput] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState<string[]>([
    'multiple_choice',
    'short_answer',
    'true_false',
  ]);
  const [fromMistakes, setFromMistakes] = useState(false);

  const [phase, setPhase] = useState<ArenaPhase>('setup');
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [isAnswering, setIsAnswering] = useState(false);
  const [shortAnswer, setShortAnswer] = useState('');
  const [confidence, setConfidence] = useState(50);
  const [graded, setGraded] = useState<
    {
      questionId: string;
      questionText: string;
      userAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
      feedback: string;
      explanation?: string;
      topic?: string | null;
      confidence: number;
      sourcePage?: number;
    }[]
  >([]);

  const [error, setError] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void (async () => {
      const list = await listUserDocuments();
      setDocs(list);
      if (!docId && (initialDocumentId || list[0]?.id)) {
        setDocId(initialDocumentId || list[0]?.id || '');
      }
      setMistakes(await listMistakes());
      if (autoOpen && (initialDocumentId || list[0]?.id)) {
        setPhase('setup');
      }
    })();
  }, []);

  useEffect(() => {
    if (autoOpen && initialDocumentId) {
      setDocId(initialDocumentId);
      setPhase('setup');
      setSummaryBridge({ openMaterialPractice: false });
    }
  }, [autoOpen, initialDocumentId, setSummaryBridge]);

  // Timer during quiz
  useEffect(() => {
    if (phase !== 'quiz' || isAnswering) return;
    setTimeLeft(TIME_PER_QUESTION);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          void handleTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, currentIndex, isAnswering]);

  const toggleType = (t: string) => {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const startArena = async (weakOnly = false) => {
    if (!docId) return;
    setFromMistakes(weakOnly);
    setError(null);
    setPhase('loading');
    setGraded([]);
    setCurrentIndex(0);
    setShortAnswer('');
    setConfidence(50);

    try {
      const document = await getDocumentById(docId);
      if (!document) throw new Error('Document not found');

      let topicList = topicsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      let diff = difficulty;
      if (weakOnly) {
        const weak = mistakes
          .filter((m) => !m.reviewed && m.conceptMisunderstood)
          .map((m) => m.conceptMisunderstood!)
          .slice(0, 5);
        topicList = weak.length ? weak : topicList;
        diff = 'easy';
      } else if (!topicList.length && weakAreas.length) {
        topicList = weakAreas.slice(0, 3);
      }

      const qs = await generatePracticeFromDocument(document, {
        topics: topicList,
        difficulty: diff,
        count,
        types,
      });

      if (!qs.length) throw new Error('No questions generated. Try again.');
      setQuestions(qs as PracticeQuestion[]);
      setPhase('quiz');
    } catch (e: any) {
      setError(e?.message || 'Failed to generate practice');
      setPhase('setup');
    }
  };

  const gradeAnswer = async (q: PracticeQuestion, userAnswer: string) => {
    const type = q.type.toLowerCase();
    if (type.includes('multiple') || type.includes('true') || (q.options && q.options.length > 0)) {
      const isCorrect =
        userAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
      return {
        isCorrect,
        feedback: isCorrect ? 'Correct!' : q.explanation || `Expected: ${q.correctAnswer}`,
      };
    }
    if (!userAnswer.trim()) {
      return { isCorrect: false, feedback: 'No answer submitted (time ran out).' };
    }
    return evaluateShortAnswer(q.question, userAnswer, q.correctAnswer, q.explanation);
  };

  const advanceAfterGrade = async (
    q: PracticeQuestion,
    userAnswer: string,
    conf: number
  ) => {
    setIsAnswering(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const g = await gradeAnswer(q, userAnswer);
    const entry = {
      questionId: q.id,
      questionText: q.question,
      userAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect: g.isCorrect,
      feedback: g.feedback,
      explanation: q.explanation,
      topic: q.sourceTopic || null,
      confidence: conf,
      sourcePage: q.sourcePage,
    };

    const nextGraded = [...graded, entry];
    setGraded(nextGraded);

    if (!g.isCorrect) {
      await saveMistake({
        documentId: docId,
        question: q.question,
        originalAnswer: userAnswer || '(blank)',
        correctExplanation: q.explanation || q.correctAnswer,
        aiFeedback: g.feedback,
        conceptMisunderstood: q.sourceTopic,
        sourcePage: q.sourcePage,
        confidence: conf,
        reviewed: false,
        retryStatus: 'pending',
      });
    }

    if (currentIndex + 1 >= questions.length) {
      await finishArena(nextGraded);
    } else {
      setCurrentIndex((i) => i + 1);
      setShortAnswer('');
      setConfidence(50);
      setIsAnswering(false);
    }
  };

  const handleTimeout = async () => {
    const q = questions[currentIndex];
    if (!q || isAnswering) return;
    await advanceAfterGrade(q, shortAnswer || '', confidence);
  };

  const handleMcqAnswer = async (answer: string) => {
    const q = questions[currentIndex];
    if (!q || isAnswering) return;
    await advanceAfterGrade(q, answer, confidence);
  };

  const handleShortSubmit = async () => {
    const q = questions[currentIndex];
    if (!q || isAnswering) return;
    await advanceAfterGrade(q, shortAnswer, confidence);
  };

  const finishArena = async (
    finalGraded: typeof graded
  ) => {
    try {
      const correctCount = finalGraded.filter((r) => r.isCorrect).length;
      const accuracy = Math.round((correctCount / Math.max(finalGraded.length, 1)) * 100);
      const selected = docs.find((d) => d.id === docId);
      const weakTopics = [
        ...new Set(finalGraded.filter((r) => !r.isCorrect && r.topic).map((r) => r.topic!)),
      ];
      const strongTopics = [
        ...new Set(finalGraded.filter((r) => r.isCorrect && r.topic).map((r) => r.topic!)),
      ];

      const attemptId = await saveQuizAttempt({
        selectedDocumentIds: [docId],
        selectedFileNames: [selected?.fileName || 'Uploaded material'],
        score: accuracy,
        correctCount,
        wrongCount: finalGraded.length - correctCount,
        totalQuestions: finalGraded.length,
        accuracy,
        questionResults: finalGraded.map((r) => ({
          questionId: r.questionId,
          questionText: r.questionText,
          type: 'mcq' as const,
          userAnswer: r.userAnswer,
          correctAnswer: r.correctAnswer,
          isCorrect: r.isCorrect,
          explanation: r.explanation,
          feedback: r.feedback,
          topic: r.topic,
        })),
        weakTopics,
        strongTopics,
        generatedFromContentLength: selected?.rawText?.length || 0,
      });

      if (attemptId) {
        setAllAttempts([
          {
            id: attemptId,
            createdAt: { toMillis: () => Date.now() },
            selectedDocumentIds: [docId],
            selectedFileNames: [selected?.fileName || 'Uploaded material'],
            score: accuracy,
            correctCount,
            wrongCount: finalGraded.length - correctCount,
            totalQuestions: finalGraded.length,
            accuracy,
            questionResults: finalGraded.map((r) => ({
              questionId: r.questionId,
              questionText: r.questionText,
              type: 'mcq' as const,
              userAnswer: r.userAnswer,
              correctAnswer: r.correctAnswer,
              isCorrect: r.isCorrect,
              explanation: r.explanation,
              feedback: r.feedback,
              topic: r.topic,
            })),
            weakTopics,
            strongTopics,
            generatedFromContentLength: selected?.rawText?.length || 0,
          },
          ...allAttempts,
        ]);
        if (weakTopics.length) {
          setWeakAreas([...new Set([...weakTopics, ...weakAreas])].slice(0, 12));
        }
      }

      setMistakes(await listMistakes());
    } catch (e: any) {
      setError(e?.message || 'Could not save results');
    } finally {
      setIsAnswering(false);
      setPhase('results');
    }
  };

  const markReviewed = async (id: string) => {
    await updateMistake(id, { reviewed: true, retryStatus: 'reviewed' });
    setMistakes(await listMistakes());
  };

  const scheduleWeak = async (topic: string) => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const date = today.toISOString().slice(0, 10);
    const task = {
      topic,
      documentId: docId || undefined,
      fileName: docs.find((d) => d.id === docId)?.fileName,
      date,
      durationMinutes: 40,
      source: 'exam_prep' as const,
    };
    const id = await saveRevisionTask(task);
    addRevisionTaskLocal({ ...task, id, createdAt: null });
  };

  const current = questions[currentIndex];
  const isMcq =
    !!current &&
    (Boolean(current.options?.length) ||
      current.type.toLowerCase().includes('multiple') ||
      current.type.toLowerCase().includes('true'));

  const asGeneratedQuestion = (q: PracticeQuestion): GeneratedQuestion => ({
    id: q.id,
    type: 'mcq',
    question: q.question,
    options: q.options?.length
      ? q.options
      : current?.type.toLowerCase().includes('true')
        ? ['True', 'False']
        : ['A', 'B', 'C', 'D'],
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    sourceTopic: q.sourceTopic,
  });

  if (docs.length === 0 && phase === 'setup') {
    return (
      <div className="surface rounded-2xl border border-line p-6 mt-8">
        <h3 className="text-lg font-bold mb-2 text-ink">Exam Prep Arena</h3>
        <p className="text-sm text-muted">Upload a document first, then return here to start a practice quiz.</p>
      </div>
    );
  }

  // ── LOADING ──
  if (phase === 'loading') {
    return (
      <div className="max-w-md mx-auto py-20 text-center animate-fade-in" role="status">
        <div className="relative w-16 h-16 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-line" />
          <div className="absolute inset-0 rounded-full border-4 border-cardinal border-t-transparent animate-spin" />
        </div>
        <h3 className="text-xl font-extrabold text-ink mb-2">Building your arena…</h3>
        <p className="text-muted text-sm">
          {fromMistakes
            ? 'Generating questions from your weak areas'
            : 'Generating practice from uploaded material'}
        </p>
      </div>
    );
  }

  // ── QUIZ ARENA ──
  if (phase === 'quiz' && current) {
    return (
      <div className="max-w-4xl mx-auto py-6 md:py-10 animate-fade-in">
        <div className="mb-8 surface rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold text-ink">
              Question {currentIndex + 1} of {questions.length}
            </h2>
            <span className="text-xs font-semibold text-muted tabular-nums">
              {timeLeft}s remaining
            </span>
          </div>
          <div
            className="w-full sm:w-56 h-2 bg-sunken rounded-full overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={TIME_PER_QUESTION}
            aria-valuenow={timeLeft}
          >
            <div
              className={`h-full bg-cardinal rounded-full ease-linear ${
                timeLeft === TIME_PER_QUESTION ? 'transition-none' : 'transition-all duration-1000'
              }`}
              style={{ width: `${(timeLeft / TIME_PER_QUESTION) * 100}%` }}
            />
          </div>
        </div>

        <div className="surface rounded-2xl p-6 md:p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-cardinal" aria-hidden="true" />

          <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider text-muted">
            <span className="px-2.5 py-1 rounded-full bg-cardinal-soft text-cardinal border border-cardinal/20">
              {current.type.replace(/_/g, ' ')}
            </span>
            {current.sourceTopic && <span>Topic: {current.sourceTopic}</span>}
            {current.sourcePage && <span>Page {current.sourcePage}</span>}
          </div>

          <div className="mb-6">
            <label className="text-xs text-muted font-semibold">
              How confident are you? {confidence}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={confidence}
              disabled={isAnswering}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>

          {isMcq ? (
            <QuizQuestion
              question={asGeneratedQuestion(current)}
              onAnswer={(ans) => void handleMcqAnswer(ans)}
              disabled={isAnswering}
            />
          ) : (
            <div className="animate-slide-up">
              <h3 className="text-xl md:text-2xl font-bold text-ink leading-snug mb-6">
                {current.question}
              </h3>
              <textarea
                value={shortAnswer}
                onChange={(e) => setShortAnswer(e.target.value)}
                disabled={isAnswering}
                rows={5}
                placeholder="Type your answer…"
                className="w-full bg-canvas border border-line-strong rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cardinal mb-5"
              />
              <button
                type="button"
                onClick={() => void handleShortSubmit()}
                disabled={isAnswering || !shortAnswer.trim()}
                className="btn-primary px-8 py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {isAnswering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Grading…
                  </>
                ) : (
                  'Submit answer'
                )}
              </button>
            </div>
          )}

          {isAnswering && isMcq && (
            <div className="mt-6 flex items-center gap-2 text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking answer…
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RESULTS ──
  if (phase === 'results') {
    const correctCount = graded.filter((r) => r.isCorrect).length;
    const accuracy = Math.round((correctCount / Math.max(graded.length, 1)) * 100);

    return (
      <div className="max-w-3xl mx-auto py-8 animate-fade-in space-y-6">
        <div className="surface rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-cardinal" aria-hidden="true" />
          <p className="eyebrow mb-3">Arena Results</p>
          <div className="text-6xl font-extrabold text-cardinal mb-2">{accuracy}%</div>
          <p className="text-muted font-medium mb-6">
            {correctCount} / {graded.length} correct
            {fromMistakes ? ' · weak-area drill' : ' · material practice'}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setPhase('setup');
                setQuestions([]);
                setGraded([]);
              }}
              className="btn-secondary px-5 py-2.5 rounded-xl font-semibold inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Back to setup
            </button>
            <button
              type="button"
              onClick={() => void startArena(false)}
              className="btn-primary px-5 py-2.5 rounded-xl font-semibold"
            >
              Play again
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {graded.map((r, idx) => (
            <div
              key={r.questionId}
              className={`rounded-xl border p-4 text-sm ${
                r.isCorrect
                  ? 'bg-success-soft/40 border-success/30'
                  : 'bg-danger-soft/40 border-danger/30'
              }`}
            >
              <div className="font-bold text-ink mb-1 flex items-center gap-2">
                {r.isCorrect ? (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                ) : (
                  <BookX className="w-4 h-4 text-danger" />
                )}
                Q{idx + 1}
                <span className="text-xs font-normal text-muted">· confidence {r.confidence}%</span>
              </div>
              <p className="text-ink mb-2">{r.questionText}</p>
              <p className={r.isCorrect ? 'text-success' : 'text-danger'}>
                Your answer: {r.userAnswer || '(blank)'}
              </p>
              {!r.isCorrect && (
                <p className="text-ink mt-1">Correct: {r.correctAnswer}</p>
              )}
              <p className="text-muted mt-1">{r.feedback}</p>
              {r.topic && !r.isCorrect && (
                <button
                  type="button"
                  onClick={() => void scheduleWeak(r.topic!)}
                  className="mt-2 text-xs font-bold text-info"
                >
                  Add “{r.topic}” to Study Schedule
                </button>
              )}
            </div>
          ))}
        </div>

        <MistakeNotebook
          mistakes={mistakes}
          onMarkReviewed={markReviewed}
          onPracticeWeak={() => void startArena(true)}
        />
      </div>
    );
  }

  // ── SETUP (default) ──
  return (
    <div className="mt-10 space-y-6">
      <div className="surface rounded-2xl border border-line p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-cardinal" aria-hidden="true" />
        <div className="mb-6">
          <h2 className="text-2xl font-extrabold flex items-center gap-2 text-ink">
            <Brain className="w-6 h-6 text-cardinal" /> Exam Prep Arena
          </h2>
          <p className="text-sm text-muted mt-1">
            Same quiz-arena feel as Challenge — one question at a time, timed, graded from your uploads.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted">Document</label>
            <select
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              className="w-full mt-1 bg-surface border border-line-strong rounded-xl px-3 py-2.5 text-ink"
            >
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fileName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted">
              Topics (optional, comma-separated)
            </label>
            <input
              value={topicsInput}
              onChange={(e) => setTopicsInput(e.target.value)}
              placeholder="e.g. recursion, gradients"
              className="w-full mt-1 bg-surface border border-line-strong rounded-xl px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="w-full mt-1 bg-surface border border-line-strong rounded-xl px-3 py-2.5"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted">Questions</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {[5, 8, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`px-4 py-2 rounded-full text-sm font-bold border ${
                    count === n
                      ? 'border-cardinal bg-cardinal-soft text-cardinal'
                      : 'border-line text-muted'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-5">
          <div className="text-xs font-bold uppercase text-muted mb-2">Question types</div>
          <div className="flex flex-wrap gap-2">
            {[
              ['multiple_choice', 'Multiple choice'],
              ['short_answer', 'Short answer'],
              ['concept_explanation', 'Concept explanation'],
              ['application', 'Application'],
              ['true_false', 'True/false'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleType(id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  types.includes(id)
                    ? 'border-cardinal bg-cardinal-soft text-cardinal'
                    : 'border-line text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void startArena(false)}
            disabled={!docId || types.length === 0}
            className="btn-primary px-6 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Enter Arena →
          </button>
          <button
            type="button"
            onClick={() => void startArena(true)}
            disabled={!docId || mistakes.filter((m) => !m.reviewed).length === 0}
            className="btn-secondary px-6 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Practice My Weak Areas
          </button>
        </div>

        {error && (
          <div className="mt-4 text-sm text-danger flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}
      </div>

      <MistakeNotebook
        mistakes={mistakes}
        onMarkReviewed={markReviewed}
        onPracticeWeak={() => void startArena(true)}
      />
    </div>
  );
};

function MistakeNotebook({
  mistakes,
  onMarkReviewed,
  onPracticeWeak,
}: {
  mistakes: MistakeEntry[];
  onMarkReviewed: (id: string) => void;
  onPracticeWeak: () => void;
}) {
  return (
    <div className="surface rounded-2xl border border-line p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xl font-extrabold text-ink">My Mistakes</h3>
          <p className="text-sm text-muted">
            Incorrect arena answers saved for review. One correction does not mean mastery.
          </p>
        </div>
        {mistakes.some((m) => !m.reviewed) && (
          <button
            type="button"
            onClick={onPracticeWeak}
            className="btn-secondary px-4 py-2 rounded-full text-sm font-bold"
          >
            Practice weak areas
          </button>
        )}
      </div>
      {mistakes.length === 0 ? (
        <p className="text-muted text-sm">No mistakes saved yet.</p>
      ) : (
        <div className="space-y-3">
          {mistakes.slice(0, 12).map((m) => (
            <div key={m.id} className="rounded-xl border border-line p-4 text-sm bg-sunken">
              <div className="font-semibold text-ink mb-1">{m.question}</div>
              <div className="text-danger">Your answer: {m.originalAnswer}</div>
              <div className="text-success mt-1">{m.correctExplanation}</div>
              {m.aiFeedback && <div className="text-muted mt-1">{m.aiFeedback}</div>}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted">
                {m.conceptMisunderstood && <span>Concept: {m.conceptMisunderstood}</span>}
                {m.sourcePage && <span>Page {m.sourcePage}</span>}
                {typeof m.confidence === 'number' && <span>Confidence {m.confidence}%</span>}
                <span>{m.reviewed ? 'Reviewed' : 'Needs review'}</span>
              </div>
              {!m.reviewed && m.id && (
                <button
                  type="button"
                  onClick={() => onMarkReviewed(m.id!)}
                  className="mt-2 text-xs font-bold text-cardinal"
                >
                  Mark misconception as reviewed
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MaterialPractice;
