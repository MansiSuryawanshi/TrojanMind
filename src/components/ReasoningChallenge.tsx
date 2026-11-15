import React, { useEffect, useState, useRef } from 'react';
import { 
  listUserDocuments, 
  createChallengeSession,
  joinChallengeSession,
  onChallengeSessionUpdate,
  updateSession,
  submitParticipantResults,
  removeDocument,
  removeDocuments,
  saveQuizAttempt,
  USER_ID,
  type StudyDocument 
} from '../services/firebaseService';
import { generateQuizFromContent, generateClaudeCompetitorAnswers, generateFallbackQuiz } from '../services/quizService';
import { cleanStudyContent } from '../services/contentService';
import { useStore } from '../store/store';
import QuizQuestion from './QuizQuestion';
import { Trash2, Trash } from 'lucide-react';
import type { ChallengeSession, QuizAttempt } from '../types';

type QuizPhase = 
  | 'selection' 
  | 'mode-selection' 
  | 'count-selection' 
  | 'waiting-room' 
  | 'loading' 
  | 'no-content' 
  | 'generation-error' 
  | 'quiz' 
  | 'results';

type LoadingStep = 'reading' | 'extracting' | 'generating' | 'competitor';

const TIME_PER_QUESTION = 60;

interface QuestionResult {
  questionId: string;
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
  topic?: string;
}

const ReasoningChallenge: React.FC<{ onAddMaterial?: () => void }> = ({ onAddMaterial }) => {
  const allAttempts = useStore((s) => s.allAttempts);
  const [phase, setPhase] = useState<QuizPhase>('selection');
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('reading');
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [questionCount, setQuestionCount] = useState(10);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  
  // Multiplayer / Competitor State
  const [session, setSessionState] = useState<ChallengeSession | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [activeReviewPlayer, setActiveReviewPlayer] = useState<string>(USER_ID);
  const [isSoloMode, setIsSoloMode] = useState(false);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);

  const { currentQuiz, setQuiz, clearQuizAnswers } = useStore();
  const timerRef = useRef<any>(null);

  // ── INIT & DEEP LINKING ──────────────────────────────────────────────────

  useEffect(() => {
    loadDocs();
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('roomId') || params.get('roomCode');
    if (roomId) {
      console.log(`[Challenge] Deep link detected: ${roomId}`);
      handleJoinRoom(roomId);
    }
  }, []);

  const loadDocs = async () => {
    const docs = await listUserDocuments();
    setDocuments(docs);
    if (docs.length === 0) setPhase('no-content');
    else if (phase === 'no-content') setPhase('selection');
  };

  const handleJoinRoom = async (code: string) => {
    try {
      setPhase('loading');
      setLoadingStep('reading');
      console.log(`[Challenge-Pipeline] Attempting to join session: ${code}`);

      // GHOST CHECK: If we are already the host of this session (locally), don't join as guest
      if (session?.roomCode === code && isHost) {
        console.log(`[Challenge-Pipeline] You are already the established host. Skipping Guest-Join.`);
        setPhase('waiting-room');
        return;
      }

      const joinedSession = await joinChallengeSession(code, USER_ID, `Student #${Math.floor(Math.random() * 999)}`);
      if (joinedSession) {
        console.log(`[Challenge-Pipeline] Join SUCCESS. Role: Guest.`);
        setSessionState(joinedSession);
        setIsHost(false);
        setPhase('waiting-room');
        subscribeToSession(joinedSession.id);
      }
    } catch (error) {
      console.error("[Challenge-Pipeline] Failed to join room:", error);
      setPhase('selection');
      alert("Could not join room. It may be full, started, or invalid.");
    }
  };

  const subscribeToSession = (sessionId: string) => {
    return onChallengeSessionUpdate(sessionId, (updated) => {
      setSessionState(updated);
      
      // If host started the quiz
      if (updated.status === 'active' && phase !== 'quiz' && updated.questions?.length > 0) {
        console.group(`[Challenge-Pipeline] Quiz Session Activated`);
        console.log(`Received ${updated.questions.length} questions from Firebase.`);
        console.log(`Status: ${updated.status} | Mode: ${updated.claudeCompetitor ? 'Solo/AI' : 'Multiplayer'}`);
        setQuiz(updated.questions);
        clearQuizAnswers();
        setPhase('quiz');
        setCurrentQuestionIndex(0);
        console.groupEnd();
      }
      
      // If everyone finished
      if (updated.status === 'completed') {
        console.log(`[Challenge] Session ${sessionId} is COMPLETED.`);
        setPhase('results');
      }
    });
  };

  // ── DELETE ACTIONS ────────────────────────────────────────────────────────

  const handleDeleteDoc = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation(); // Don't trigger selection
    console.log(`[Challenge] Delete clicked for: ${docId}`);
    
    if (window.confirm("Are you sure you want to delete this study material?")) {
      try {
        await removeDocument(docId);
        console.log(`[Challenge] Firebase delete success: ${docId}`);
        
        // Update local state immediately
        setDocuments(prev => prev.filter(d => d.id !== docId));
        
        // Remove from selection if it was selected
        if (selectedDocIds.has(docId)) {
          const next = new Set(selectedDocIds);
          next.delete(docId);
          setSelectedDocIds(next);
        }
        
        console.log(`[Challenge] UI state updated after delete.`);
        
        // If no docs left, show no-content
        if (documents.length <= 1) {
          setPhase('no-content');
        }
      } catch (err) {
        console.error("[Challenge] Delete failed:", err);
        alert("Failed to delete document.");
      }
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${ids.length} selected materials?`)) {
      try {
        await removeDocuments(ids);
        console.log(`[Challenge] Bulk delete success for ${ids.length} items.`);
        
        setDocuments(prev => prev.filter(d => !selectedDocIds.has(d.id!)));
        setSelectedDocIds(new Set());
        console.log(`[Challenge] UI state updated after bulk delete.`);
        
        if (documents.length <= ids.length) {
          setPhase('no-content');
        }
      } catch (err) {
        console.error("[Challenge] Bulk delete failed:", err);
        alert("Failed to delete some documents.");
      }
    }
  };

  // ── TIMER LOGIC ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'quiz' && currentQuiz) {
      setTimeLeft(TIME_PER_QUESTION);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleAnswer("TIME_OUT", false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentQuestionIndex, currentQuiz]);

  // ── ACTIONS ──────────────────────────────────────────────────────────────

  const handleCreateRoom = async () => {
    console.log(`[Challenge] Creating ${isSoloMode ? 'solo' : 'multiplayer'} room...`);
    const selected = documents.filter(d => selectedDocIds.has(d.id!));
    const newSession = await createChallengeSession(
      USER_ID, 
      "Host (You)", 
      Array.from(selectedDocIds), 
      selected.map(d => d.fileName),
      questionCount
    );
    if (newSession) {
      setSessionState(newSession);
      setIsHost(true);
      setPhase('waiting-room');
      subscribeToSession(newSession.id);
    }
  };

  const handleStartChallenge = async () => {
    if (!session) return;
    console.log(`[Challenge] Host starting challenge for session: ${session.id}`);
    console.log(`[Challenge] Quiz generation started with count: ${session.questionCount}`);
    setPhase('loading');
    setLoadingStep('generating');
    
    console.group(`[Challenge-Pipeline] INITIATING ARENA`);
    console.log(`Setting: { questionCount: ${session.questionCount}, docIds: ${session.docIds.length} }`);
    console.groupEnd();

    try {
      const selectedDocs = documents.filter(d => session.docIds.includes(d.id!));
      const rawContent = selectedDocs.map(d => d.rawText).join('\n\n---\n\n');
      
      console.group(`[Challenge-Pipeline] Data Ingestion & Cleaning`);
      const { cleanedText, originalLength, cleanedLength, detectedTopics } = cleanStudyContent(rawContent);
      console.log(`Input Analysis: { originalLength: ${originalLength}, cleanedLength: ${cleanedLength}, topics: ${detectedTopics.length} }`);
      console.groupEnd();

      console.log(`[Challenge-Pipeline] Requesting ${session.questionCount} MCQ-only questions from Service...`);
      const rawQuestions = await generateQuizFromContent(cleanedText, session.questionCount);
      // Challenge is MCQ-only — drop anything without 4 options
      const questions = rawQuestions
        .map((q, i) => ({
          ...q,
          id: q.id || `q${i + 1}`,
          type: 'mcq' as const,
          options: (q.options || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4),
        }))
        .filter((q) => q.options.length === 4 && q.options.includes(q.correctAnswer));
      if (!questions.length) {
        throw new Error('No valid multiple-choice questions generated. Try again.');
      }
      console.log(`[Challenge-Pipeline] Generation SUCCESS. MCQs kept: ${questions.length}`);
      
      let claudeCompetitor = session.claudeCompetitor || Object.keys(session.participants).length === 1;
      
      let claudeData = null;
      if (claudeCompetitor) {
        setLoadingStep('competitor');
        console.log(`[Challenge] Running solo/low-count mode. Claude AI joining as competitor.`);
        const claudeAnswers = await generateClaudeCompetitorAnswers(questions, cleanedText);
        
        const correctCount = Object.values(claudeAnswers).filter(a => a.isCorrect).length;
        claudeData = {
          score: correctCount * 10,
          correctCount,
          wrongCount: questions.length - correctCount,
          accuracy: Math.round((correctCount / questions.length) * 100),
          answers: Object.entries(claudeAnswers).reduce((acc, [id, data]) => ({...acc, [id]: data.answer}), {})
        };
      }

      console.log(`[Challenge-Pipeline] Updating session ${session.id} with ${questions.length} questions.`);
      await updateSession(session.id, {
        questions,
        status: 'active',
        claudeCompetitor: claudeCompetitor,
        ...(claudeData && { [`participants.claude_ai`]: {
          uid: 'claude_ai',
          name: 'Claude AI (Grandmaster)',
          isHost: false,
          joinedAt: new Date(),
          status: 'finished',
          results: claudeData
        }})
      });

    } catch (error: any) {
      console.group("[Challenge-Pipeline] Generation CRITICAL FAILURE");
      console.error(error);
      setGenerationError(error?.message || "Remote API Timeout or Connection Reset");
      setPhase('generation-error');
      console.groupEnd();
    }
  };

  const handleUseFallback = async () => {
    if (!session) return;
    console.log(`[Challenge] User opted for Fallback Generation.`);
    setPhase('loading');
    setLoadingStep('generating');
    
    try {
      const selectedDocs = documents.filter(d => session.docIds.includes(d.id!));
      const combinedContent = selectedDocs.map(d => d.rawText).join('\n\n---\n\n');
      
      console.log(`[Challenge] Requesting rule-based fallback from QuizService...`);
      const questions = (await generateFallbackQuiz(combinedContent, session.questionCount))
        .map((q, i) => ({
          ...q,
          id: q.id || `fb${i + 1}`,
          type: 'mcq' as const,
          options: (q.options || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4),
        }))
        .filter((q) => q.options.length >= 2);
      
      await updateSession(session.id, {
        questions,
        status: 'active',
        claudeCompetitor: true // Force competitor for fallbacks
      });
      console.log(`[Challenge] Fallback quiz active.`);
    } catch (err) {
      console.error("[Challenge] Fallback also failed.", err);
      setPhase('generation-error');
    }
  };

  const handleAnswer = async (answer: string, isCorrect?: boolean) => {
    if (isAnswering) return;
    setIsAnswering(true); // LOCKOUT: prevent double-clicks
    
    if (timerRef.current) clearInterval(timerRef.current);
    const currentQuestion = currentQuiz![currentQuestionIndex];
    
    console.log(`[Challenge-Pipeline] Question ${currentQuestionIndex + 1} Answered. Correct: ${isCorrect}`);

    const result: QuestionResult = {
      questionId: currentQuestion.id,
      questionText: currentQuestion.question,
      userAnswer: answer,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect: !!isCorrect,
      explanation: currentQuestion.explanation,
      topic: currentQuestion.sourceTopic
    };

    const newResults = [...results, result];
    setResults(newResults);

    // DETERMINISTIC NEXT: Pass the check logic to the timeout
    const isLast = currentQuestionIndex >= (currentQuiz?.length || 0) - 1;

    setTimeout(async () => {
      setIsAnswering(false); // RELEASE LOCKOUT
      if (!isLast) {
        setTimeLeft(TIME_PER_QUESTION); // Sync timer reset with index change
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        await finishQuiz(newResults);
      }
    }, 450);
  };

  const finishQuiz = async (finalResults: QuestionResult[]) => {
    console.log(`[Challenge-Pipeline] SESSION FINISHING: Persistence initiated.`);
    
    const correctCount = finalResults.filter(r => r.isCorrect).length;
    const totalQuestions = finalResults.length;
    const accuracy = Math.round((correctCount / totalQuestions) * 100);
    
    const participantResults = {
      score: correctCount * 10,
      correctCount,
      wrongCount: totalQuestions - correctCount,
      accuracy,
      answers: finalResults.reduce((acc, r) => ({...acc, [r.questionId]: r.userAnswer}), {})
    };

    try {
      const selectedDocs = documents.filter(d => (session?.docIds || Array.from(selectedDocIds)).includes(d.id!));
      const attempt: Omit<QuizAttempt, "id"> = {
        createdAt: new Date(),
        selectedDocumentIds: session?.docIds || Array.from(selectedDocIds),
        selectedFileNames: session?.docNames || selectedDocs.map(d => d.fileName),
        totalQuestions,
        score: participantResults.score,
        correctCount,
        wrongCount: totalQuestions - correctCount,
        accuracy,
        questionResults: finalResults.map((r) => ({
          questionId: r.questionId,
          questionText: r.questionText,
          type: "mcq",
          userAnswer: r.userAnswer,
          correctAnswer: r.correctAnswer,
          isCorrect: !!r.isCorrect,
          explanation: r.explanation || null,
          topic: r.topic || "General"
        })),
        weakTopics: Array.from(new Set(finalResults.filter(r => !r.isCorrect).map(r => r.topic || 'General'))),
        strongTopics: Array.from(new Set(finalResults.filter(r => r.isCorrect).map(r => r.topic || 'General'))),
        generatedFromContentLength: selectedDocs.length
      };

      console.group("[Challenge] Quiz Persistence Analysis");
      console.log(`Quiz completed. Detected ${totalQuestions} questions.`);
      console.log(`Summary: ${correctCount} Correct, ${totalQuestions - correctCount} Wrong, ${accuracy}% Accuracy.`);
      console.log(`Saving to: users/${USER_ID}/quizAttempts`);
      console.log("Payload Sample:", {
        score: attempt.score,
        accuracy: attempt.accuracy,
        docs: attempt.selectedFileNames,
        questions: attempt.questionResults.length
      });
      
      const attemptId = await saveQuizAttempt(attempt);
      setSavedAttemptId(attemptId);
      
      // Analytics Logging
      console.group("[Challenge-ANALYTICS] Session Summary");
      console.log(`User: ${USER_ID} | Score: ${attempt.score} | Accuracy: ${attempt.accuracy}%`);
      console.log(`Questions: ${totalQuestions} | Correct: ${correctCount}`);
      console.log(`Attempt ID: ${attemptId}`);
      console.groupEnd();

      // GROUNDING: Update the global store immediately so other tabs react
      const newAllAttempts = [{ id: attemptId || Date.now().toString(), ...attempt }, ...allAttempts];
      useStore.getState().setAllAttempts(newAllAttempts);
      
      console.log(`[Challenge-SYNC] Firebase save SUCCESS. Store updated with ${newAllAttempts.length} total attempts.`);
      console.groupEnd();
    } catch (err) {
      console.error(`[Challenge-SYNC] Quiz result save FAILURE:`, err);
      console.groupEnd();
    }

    if (session) {
      console.log(`[Challenge] Participant finished multiplayer. Submitting results for: ${USER_ID}`);
      await submitParticipantResults(session.id, USER_ID, participantResults);
      
      const updatedParticipants = { ...session.participants, [USER_ID]: { ...session.participants[USER_ID], results: participantResults, status: 'finished' } };
      const allFinished = Object.values(updatedParticipants).every(p => p.status === 'finished');
      
      if (allFinished) {
        console.log(`[Challenge] All participants finished. Marking session as completed.`);
        await updateSession(session.id, { status: 'completed' });
      } else {
        setPhase('loading');
        setLoadingStep('competitor'); // Use competitor loading for "waiting for others"
      }
    } else {
      setPhase('results');
    }
  };

  // ── HELPERS ──────────────────────────────────────────────────────────────

  const getLeaderboard = () => {
    if (!session) return [];
    return Object.values(session.participants)
      .filter(p => p.results)
      .sort((a, b) => {
        // Sort by Score, then by Accuracy as a tie-breaker
        const scoreDiff = (b.results?.score || 0) - (a.results?.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.results?.accuracy || 0) - (a.results?.accuracy || 0);
      });
  };

  const copyRoomCode = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.roomCode);
    alert("Room code copied to clipboard!");
  };

  const copyInviteLink = () => {
    if (!session) return;
    const url = `${window.location.origin}${window.location.pathname}?roomId=${session.roomCode}`;
    navigator.clipboard.writeText(url);
    alert("Full invite link copied to clipboard!");
  };

  // ── VIEWS ──────────────────────────────────────────────────────────────────

  if (phase === 'no-content') {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center animate-fade-in">
        <div className="w-20 h-20 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-8 border border-line text-muted">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-4 text-ink">No Study Material Found</h2>
        <p className="text-muted mb-8">Upload some notes or PDFs to start the reasoning challenge.</p>
        <button onClick={() => (onAddMaterial ? onAddMaterial() : (window.location.href = '/'))} className="btn-secondary px-8 py-3.5 rounded-xl font-semibold">Add material</button>
      </div>
    );
  }

  if (phase === 'selection') {
    return (
      <div className="max-w-4xl mx-auto py-6 md:py-10 animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink mb-2">Reasoning Challenge</h2>
            <p className="text-muted">
              Step 1: Pick your source materials.
              {onAddMaterial && (
                <>
                  {' '}
                  <button type="button" onClick={onAddMaterial} className="btn-link underline underline-offset-4">
                    Add material
                  </button>
                </>
              )}
            </p>
          </div>
          {selectedDocIds.size > 0 && (
            <button 
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger-soft text-danger border border-danger/20 hover:border-danger/50 transition-colors font-semibold text-sm cursor-pointer"
            >
              <Trash size={16} />
              Delete Selected ({selectedDocIds.size})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {documents.map((doc) => (
            <div 
              key={doc.id} 
              onClick={() => {
                const next = new Set(selectedDocIds);
                if (next.has(doc.id!)) next.delete(doc.id!);
                else next.add(doc.id!);
                setSelectedDocIds(next);
              }} 
              className={`group relative p-5 md:p-6 rounded-2xl border transition-colors cursor-pointer ${selectedDocIds.has(doc.id!) ? 'border-cardinal bg-cardinal-soft ring-1 ring-cardinal' : 'border-line bg-surface hover:border-line-strong shadow-[var(--shadow-card)]'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-4 pl-4">
                  <h3 className="font-bold text-lg text-ink mb-1 truncate">{doc.fileName}</h3>
                  <p className="text-xs text-muted font-medium">Uploaded {new Date((doc.uploadedAt?.seconds || 0) * 1000).toLocaleDateString()}</p>
                </div>
                <button 
                  onClick={(e) => handleDeleteDoc(e, doc.id!)}
                  className="p-2 rounded-lg bg-sunken text-muted hover:bg-danger-soft hover:text-danger transition-colors md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                  aria-label={`Delete ${doc.fileName}`}
                  title="Delete material"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              
              {selectedDocIds.has(doc.id!) && (
                <div className="absolute top-[30px] left-4 w-2 h-2 rounded-full bg-cardinal" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        <div className="sticky bottom-6 flex justify-center">
          <button 
            disabled={selectedDocIds.size === 0} 
            onClick={() => setPhase('mode-selection')} 
            className="btn-primary px-10 py-4 rounded-xl font-semibold text-lg"
          >
            Next Step →
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'mode-selection') {
    return (
      <div className="max-w-2xl mx-auto py-6 md:py-10 animate-fade-in text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink mb-2">Challenge Mode</h2>
        <p className="text-muted mb-10">How would you like to compete?</p>
        <div className="grid grid-cols-1 gap-4 mb-10">
          <button 
            onClick={() => { setIsSoloMode(true); setPhase('count-selection'); }} 
            className="p-6 md:p-8 rounded-2xl border border-line bg-surface text-left card-hover cursor-pointer shadow-[var(--shadow-card)]"
          >
            <h3 className="text-xl md:text-2xl font-bold text-ink mb-1">Solo vs Claude</h3>
            <p className="text-muted font-medium">Face the Grandmaster AI one-on-one.</p>
          </button>
          <button 
            onClick={() => { setIsSoloMode(false); setPhase('count-selection'); }} 
            className="p-6 md:p-8 rounded-2xl border border-cardinal bg-cardinal-soft text-left card-hover cursor-pointer"
          >
            <h3 className="text-xl md:text-2xl font-bold text-ink mb-1">Live Multiplayer</h3>
            <p className="text-cardinal font-semibold">Create a room and invite friends.</p>
          </button>
        </div>
        <button onClick={() => setPhase('selection')} className="btn-link">← Back to Materials</button>
      </div>
    );
  }

  if (phase === 'count-selection') {
    return (
      <div className="max-w-2xl mx-auto py-6 md:py-10 animate-fade-in text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink mb-2">Question Count</h2>
        <p className="text-muted mb-10">Multiple-choice only — pick how many MCQs to run.</p>
        <div className="grid grid-cols-2 gap-3 md:gap-4 mb-10">
          {[5, 10, 20, 50].map((count) => (
            <button 
              key={count} 
              onClick={() => { 
                setQuestionCount(count); 
                console.log(`[Challenge] Question count selected: ${count}`);
              }} 
              aria-pressed={questionCount === count}
              className={`p-6 md:p-8 rounded-2xl border transition-colors font-bold text-3xl cursor-pointer ${questionCount === count ? 'border-cardinal bg-cardinal-soft ring-1 ring-cardinal text-cardinal' : 'border-line bg-surface text-ink hover:border-line-strong shadow-[var(--shadow-card)]'}`}
            >
              {count}
              <span className="block text-xs font-semibold text-muted mt-2 uppercase tracking-wider">Questions</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-4">
          <button 
            onClick={handleCreateRoom} 
            className="btn-primary px-10 py-4 rounded-xl font-semibold text-lg"
          >
            {isSoloMode ? "Start Challenge →" : "Create Multiplayer Room →"}
          </button>
          <button 
            onClick={() => setPhase('mode-selection')} 
            className="btn-link"
          >
            ← Back to Mode
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'waiting-room' && session) {
    const players = Object.values(session.participants);
    const inviteUrl = `${window.location.origin}${window.location.pathname}?roomId=${session.roomCode}`;
    
    return (
      <div className="max-w-3xl mx-auto py-6 md:py-10 animate-fade-in">
        <div className="surface rounded-2xl p-6 md:p-12 text-center mb-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-cardinal" aria-hidden="true" />
          <h2 className="eyebrow mb-4">Live Challenge Room</h2>
          
          {!isSoloMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 mt-6">
              {/* Room Code Box */}
              <div className="p-6 md:p-8 rounded-xl bg-canvas border border-line flex flex-col items-center gap-2">
                 <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Room Code</span>
                 <span className="text-4xl md:text-5xl font-extrabold text-cardinal tracking-widest leading-none mb-4">{session.roomCode}</span>
                 <button onClick={copyRoomCode} className="btn-secondary px-5 py-2 rounded-full text-xs font-semibold">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copy Code
                 </button>
              </div>
              
              {/* Invite Link Box */}
              <div className="p-6 md:p-8 rounded-xl bg-canvas border border-line flex flex-col items-center gap-2 overflow-hidden">
                 <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Invite Link</span>
                 <div className="w-full truncate text-xs text-muted font-mono bg-surface p-3 rounded-lg mb-4 border border-line">
                    {inviteUrl}
                 </div>
                 <button onClick={copyInviteLink} className="btn-primary px-5 py-2 rounded-full text-xs font-semibold">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    Copy Invite Link
                 </button>
              </div>
            </div>
          )}
          
          <div className="space-y-4 mb-10 max-w-sm mx-auto">
            <h3 className="text-xs font-bold text-muted uppercase tracking-widest">{isSoloMode ? "Competitors" : `Joined Players (${players.length})`}</h3>
            <div className="grid gap-3">
              {players.map((p, i) => (
                <div key={p.uid || i} className={`p-4 rounded-xl border flex items-center justify-between ${p.uid === USER_ID ? 'bg-cardinal-soft border-cardinal/30' : 'bg-surface border-line'}`}>
                   <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${p.isHost ? 'bg-cardinal text-gold' : 'bg-success-soft text-success'}`}>
                        {p.name ? p.name[0] : '?'}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-ink text-sm">
                          {p.name} {p.uid === USER_ID && "(You)"}
                        </span>
                        {p.isHost && <span className="text-[10px] font-bold text-cardinal uppercase tracking-widest">Room Host</span>}
                      </div>
                   </div>
                   {p.status === 'finished' && (
                     <span className="px-2 py-0.5 rounded-full bg-success-soft text-success text-[10px] font-bold uppercase">Ready</span>
                   )}
                </div>
              ))}
              {isSoloMode && (
                <div className="p-4 rounded-xl bg-gold-soft border border-gold/60 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-ink font-bold text-xs">C</div>
                      <span className="font-bold text-ink">Claude AI (Grandmaster)</span>
                   </div>
                   <span className="text-[10px] font-bold text-gold-ink uppercase">Opponent</span>
                </div>
              )}
            </div>
          </div>

          {isHost ? (
            <button onClick={handleStartChallenge} className="btn-primary px-10 py-4 rounded-xl font-semibold text-lg w-full">
               {isSoloMode ? "Start Solo Challenge" : (players.length === 1 ? "Start vs Claude AI" : "Start Live Challenge")}
            </button>
          ) : (
            <div className="p-5 bg-canvas rounded-xl text-muted font-semibold border border-line">
                Waiting for host to start the arena...
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="max-w-md mx-auto py-24 text-center animate-fade-in" role="status" aria-live="polite">
        <div className="relative w-16 h-16 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-line" />
          <div className="absolute inset-0 rounded-full border-4 border-cardinal border-t-transparent animate-spin" />
        </div>
        {loadingStep === 'competitor' && <p className="text-muted text-sm mt-4 italic">Waiting for other participants to finish...</p>}
      </div>
    );
  }

  if (phase === 'quiz' && currentQuiz) {
    const q = currentQuiz[currentQuestionIndex];
    return (
      <div className="max-w-4xl mx-auto py-6 md:py-10">
        <div className="mb-8 surface rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
           <div>
             <h2 className="text-base md:text-lg font-bold text-ink">Question {currentQuestionIndex + 1} of {currentQuiz.length}</h2>
             <span className="text-xs font-semibold text-muted tabular-nums">{timeLeft}s remaining</span>
           </div>
           <div className="w-full sm:w-56 h-2 bg-sunken rounded-full overflow-hidden" role="progressbar" aria-label="Time remaining" aria-valuemin={0} aria-valuemax={TIME_PER_QUESTION} aria-valuenow={timeLeft}>
             <div 
               className={`h-full bg-cardinal rounded-full ease-linear ${timeLeft === TIME_PER_QUESTION ? 'transition-none' : 'transition-all duration-1000'}`} 
               style={{ width: `${(timeLeft / TIME_PER_QUESTION) * 100}%` }} 
             />
           </div>
        </div>
        <QuizQuestion 
          key={currentQuestionIndex}
          question={q} 
          onAnswer={handleAnswer} 
          disabled={isAnswering} 
        />
      </div>
    );
  }

  if (phase === 'results') {
    const leaderboard = getLeaderboard();
    const hasAnyPoints = leaderboard.some(p => (p.results?.score || 0) > 0);
    const winner = hasAnyPoints ? leaderboard[0] : null;

    return (
      <div className="max-w-5xl mx-auto py-6 md:py-10 animate-slide-up">
        {/* Winner Announcement */}
        <div className="text-center mb-12">
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 border ${winner ? 'bg-gold border-gold text-ink' : 'bg-sunken border-line text-muted'}`}>
            {winner ? (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
            ) : (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            )}
          </div>
          <h2 className="text-4xl md:text-6xl font-extrabold text-ink tracking-tight mb-3">
            {!hasAnyPoints ? "No One Won! 😅" : (winner?.uid === USER_ID ? "Victory! 🏆" : (winner?.uid === 'claude_ai' ? "Claude AI Wins! 🤖" : `${winner?.name || 'Player'} Wins!`))}
          </h2>
          <p className="text-muted font-medium text-lg">{!hasAnyPoints ? "Everyone finished with 0 pts. Practice makes perfect!" : (session?.claudeCompetitor ? "Against the Grandmaster Claude AI" : "Live Challenge Comparison")}</p>
          {savedAttemptId && <p className="text-xs text-muted font-semibold mt-3 uppercase tracking-wider">Attempt Saved: {savedAttemptId}</p>}
        </div>

        {/* Leaderboard */}
        {session && (
          <div className="surface rounded-2xl p-5 md:p-8 mb-12">
            <h3 className="eyebrow mb-6 text-center">Global Podium</h3>
            <div className="grid gap-3">
              {leaderboard.map((p, i) => (
                <div 
                  key={i} 
                  className={`p-4 md:p-6 rounded-xl border flex items-center justify-between gap-4 ${p.uid === USER_ID ? 'border-cardinal bg-cardinal-soft' : (p.uid === 'claude_ai' ? 'border-gold/60 bg-gold-soft' : 'border-line bg-surface')}`}
                >
                  <div className="flex items-center gap-4 md:gap-6 min-w-0">
                    <span className={`text-2xl md:text-4xl font-extrabold w-10 shrink-0 ${i === 0 ? 'text-gold-ink' : 'text-muted'}`}>#{i + 1}</span>
                    <div>
                      <h4 className="text-lg md:text-xl font-bold text-ink truncate">{p.name}</h4>
                      <span className="text-xs font-semibold text-muted uppercase tracking-wider">{p.results?.accuracy}% Accuracy &bull; {p.results?.correctCount} Correct</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl md:text-3xl font-extrabold text-ink whitespace-nowrap">{p.results?.score || 0} pts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Individual Review Toggles */}
        <div className="flex items-center justify-center gap-2 mb-8 overflow-x-auto pb-2" role="tablist" aria-label="Review results by player">
           {session ? leaderboard.map(p => (
             <button 
               key={p.uid} 
               onClick={() => setActiveReviewPlayer(p.uid)}
               role="tab"
               aria-selected={activeReviewPlayer === p.uid}
               className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap border cursor-pointer ${activeReviewPlayer === p.uid ? 'bg-cardinal border-cardinal text-white' : 'bg-surface border-line text-muted hover:text-cardinal hover:border-cardinal/40'}`}
             >
               {p.name} Review
             </button>
           )) : (
             <button className="bg-cardinal text-white border border-cardinal px-5 py-2.5 rounded-lg font-semibold text-sm">Your Results</button>
           )}
        </div>

        {/* Per Player List */}
        <div className="space-y-4 mb-14 animate-fade-in" key={activeReviewPlayer}>
           {(session ? session.questions : currentQuiz!).map((q, idx) => {
             const userAns = session ? session.participants[activeReviewPlayer]?.results?.answers[q.id] : results[idx]?.userAnswer;
             const isCorrect = session ? (userAns === q.correctAnswer) : results[idx]?.isCorrect;

             return (
               <div key={idx} className={`surface rounded-2xl p-5 md:p-7 border-l-4 ${isCorrect ? 'border-l-success' : 'border-l-danger'}`}>
                 <div className="flex items-start justify-between gap-4 mb-4">
                    <h4 className="text-base md:text-lg font-semibold text-ink">{q.question}</h4>
                    <span className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${isCorrect ? 'bg-success-soft text-success border-success/25' : 'bg-danger-soft text-danger border-danger/25'}`}>
                      {isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-semibold">
                    <div className="p-4 rounded-xl bg-canvas border border-line">
                       <p className="text-muted uppercase tracking-wider text-[10px] mb-2">{activeReviewPlayer === USER_ID ? "Your Answer" : `${session?.participants[activeReviewPlayer]?.name || 'Player'}'s Answer`}</p>
                       <p className={isCorrect ? 'text-success' : 'text-danger'}>{userAns || "Missing"}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-canvas border border-line">
                       <p className="text-muted uppercase tracking-wider text-[10px] mb-2">Ideal Answer</p>
                       <p className="text-ink">{q.correctAnswer}</p>
                    </div>
                 </div>
               </div>
             );
           })}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-center gap-3">
          <button onClick={() => window.location.href = '/'} className="btn-secondary px-10 py-4 rounded-xl font-semibold text-base w-full md:w-auto">Return Home</button>
          <button onClick={() => { setPhase('selection'); setSelectedDocIds(new Set()); setResults([]); setQuiz([]); setSavedAttemptId(null); }} className="btn-primary px-10 py-4 rounded-xl font-semibold text-base w-full md:w-auto">New Challenge →</button>
        </div>
      </div>
    );
  }

  if (phase === 'generation-error') {
    return (
      <div className="max-w-2xl mx-auto py-14 md:py-20 text-center animate-fade-in">
        <div className="w-20 h-20 bg-danger-soft rounded-2xl flex items-center justify-center mx-auto mb-8 border border-danger/20 text-danger">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-4 text-ink">AI Generation Failed</h2>
        <div className="p-4 rounded-xl bg-surface border border-line mb-8 text-sm text-muted font-mono break-words" role="alert">
          "{generationError || "Unknown connection error"}"
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button 
            onClick={handleStartChallenge} 
            className="btn-primary px-8 py-4 rounded-xl font-semibold text-base"
          >
            Retry AI Generation
          </button>
          <button 
            onClick={handleUseFallback} 
            className="btn-secondary px-8 py-4 rounded-xl font-semibold text-base"
          >
            Use Fallback Quiz (Instant)
          </button>
        </div>
        
        <button 
          onClick={() => setPhase('selection')} 
          className="btn-link"
        >
          ← Back to Setup
        </button>
      </div>
    );
  }

  return null;
};

export default ReasoningChallenge;
