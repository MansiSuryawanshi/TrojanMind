import { create } from 'zustand';
import type {
  Session,
  SessionPhase,
  GeneratedQuestion,
  ScheduleResponse,
  CrossExamRecord,
  TopicProgress,
  QuizAnswer,
  QuizAttempt,
} from '../types';
import type { RevisionTask } from '../types/summary';
import type { StudyCourseContext } from '../types/piazza';

/** Bridge so Summary can hand off into Exam Prep / Schedule without a router. */
export interface SummaryBridge {
  documentId: string | null;
  fileName: string | null;
  openMaterialPractice: boolean;
  topicForSchedule: string | null;
  summaryReviewedCount: number;
  flashcardsReviewedCount: number;
}

export interface SessionState {
  session: Session | null;
  schedule: ScheduleResponse | null;
  currentQuiz: GeneratedQuestion[] | null;

  // Global Data Context (Central Source of Truth)
  examDate: string | null;
  daysLeft: number | null;
  allAttempts: QuizAttempt[];
  isInitialLoadComplete: boolean;

  // Exam Prep (Developer 3)
  readinessScore: number;
  weakAreas: string[];
  topicProgress: TopicProgress[];
  crossExamHistory: CrossExamRecord[];
  quizAnswers: QuizAnswer[];

  summaryBridge: SummaryBridge;
  revisionTasks: RevisionTask[];

  /** Course currently being studied (from a Brightspace workspace), for Piazza context. */
  studyCourseContext: StudyCourseContext | null;

  setSession: (session: Session) => void;
  setQuiz: (quiz: GeneratedQuestion[]) => void;
  updatePhase: (phase: SessionPhase) => void;
  setSchedule: (schedule: ScheduleResponse | null) => void;

  setExamDate: (date: string | null) => void;
  setDaysLeft: (days: number | null) => void;
  setAllAttempts: (attempts: QuizAttempt[]) => void;
  setInitialLoadComplete: (status: boolean) => void;

  // Exam Prep actions
  adjustReadinessScore: (delta: number) => void;
  setReadinessScore: (score: number) => void;
  setWeakAreas: (areas: string[]) => void;
  setTopicProgress: (topics: TopicProgress[]) => void;
  addCrossExamRecord: (record: CrossExamRecord) => void;
  recordQuizAnswer: (answer: QuizAnswer) => void;
  clearQuizAnswers: () => void;

  setSummaryBridge: (patch: Partial<SummaryBridge>) => void;
  setRevisionTasks: (tasks: RevisionTask[]) => void;
  addRevisionTaskLocal: (task: RevisionTask) => void;
  setStudyCourseContext: (ctx: StudyCourseContext | null) => void;

  /** Drop every user-specific value (called on logout / account switch). */
  resetUserState: () => void;
}

const defaultBridge: SummaryBridge = {
  documentId: null,
  fileName: null,
  openMaterialPractice: false,
  topicForSchedule: null,
  summaryReviewedCount: 0,
  flashcardsReviewedCount: 0,
};

const userDefaults = () => ({
  session: null,
  schedule: null,
  currentQuiz: null,
  examDate: null,
  daysLeft: null,
  allAttempts: [],
  isInitialLoadComplete: false,
  readinessScore: 50,
  weakAreas: [],
  topicProgress: [],
  crossExamHistory: [],
  quizAnswers: [],
  summaryBridge: { ...defaultBridge },
  revisionTasks: [],
  studyCourseContext: null,
});

export const useStore = create<SessionState>((set) => ({
  session: null,
  schedule: null,
  currentQuiz: null,

  examDate: null,
  daysLeft: null,
  allAttempts: [],
  isInitialLoadComplete: false,

  readinessScore: 50,
  weakAreas: [],
  topicProgress: [],
  crossExamHistory: [],
  quizAnswers: [],

  summaryBridge: { ...defaultBridge },
  revisionTasks: [],
  studyCourseContext: null,

  setSession: (session: Session) => set({ session }),
  setQuiz: (quiz: GeneratedQuestion[]) => set({ currentQuiz: quiz }),
  updatePhase: (phase: SessionPhase) =>
    set((state: SessionState) => ({
      session: state.session ? { ...state.session, phase } : null,
    })),
  setSchedule: (schedule) => set({ schedule }),

  setExamDate: (examDate) => set({ examDate }),
  setDaysLeft: (daysLeft) => set({ daysLeft }),
  setAllAttempts: (allAttempts) => set({ allAttempts }),
  setInitialLoadComplete: (isInitialLoadComplete) => set({ isInitialLoadComplete }),

  adjustReadinessScore: (delta: number) =>
    set((state: SessionState) => ({
      readinessScore: Math.max(0, Math.min(100, state.readinessScore + delta)),
    })),
  setReadinessScore: (score: number) =>
    set({ readinessScore: Math.max(0, Math.min(100, score)) }),
  setWeakAreas: (areas: string[]) => set({ weakAreas: areas }),
  setTopicProgress: (topics: TopicProgress[]) => set({ topicProgress: topics }),
  addCrossExamRecord: (record: CrossExamRecord) =>
    set((state: SessionState) => ({
      crossExamHistory: [...state.crossExamHistory, record],
    })),
  recordQuizAnswer: (answer: QuizAnswer) =>
    set((state: SessionState) => ({
      quizAnswers: [...state.quizAnswers, answer],
    })),
  clearQuizAnswers: () => set({ quizAnswers: [] }),

  setSummaryBridge: (patch) =>
    set((state) => ({ summaryBridge: { ...state.summaryBridge, ...patch } })),
  setRevisionTasks: (revisionTasks) => set({ revisionTasks }),
  addRevisionTaskLocal: (task) =>
    set((state) => ({ revisionTasks: [...state.revisionTasks, task] })),
  setStudyCourseContext: (studyCourseContext) => set({ studyCourseContext }),

  resetUserState: () => set(userDefaults()),
}));
