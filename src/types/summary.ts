/** Types for the StudyBuddy Summary feature */

export type SummaryMode =
  | 'detailed'
  | 'quick'
  | 'exam_revision'
  | 'explain_simply';

export interface DocumentPage {
  page: number;
  text: string;
  charCount: number;
  isEmpty: boolean;
  likelyScanned: boolean;
}

export interface PageManifestEntry {
  page: number;
  charCount: number;
  isEmpty: boolean;
  likelyScanned: boolean;
  processed: boolean;
}

export interface DocumentChunk {
  id: string;
  index: number;
  text: string;
  startPage: number;
  endPage: number;
  headingHint?: string;
}

export interface TopicSummary {
  title: string;
  explanation: string;
  subtopics: string[];
  definitions: string[];
  formulas: string[];
  procedures: string[];
  examples: string[];
  relationships: string[];
  sourcePages: number[];
  /** 'course_info' = deadlines, grading, attendance, policies. Absent on older summaries. */
  category?: 'academic' | 'course_info';
}

/** Course logistics kept out of academic practice (deadlines, grading, policies). */
export interface CourseInfoItem {
  title: string;
  details: string[];
  sourcePages: number[];
}

export interface StructuredSummary {
  overview: string;
  topics: TopicSummary[];
  keyConcepts: string[];
  definitionsAndFormulas: { term: string; definition: string; formula?: string; sourcePages: number[] }[];
  takeaways: string[];
  examRevisionNotes: string[];
  conceptRelationships: { from: string; to: string; relationship: string }[];
  topicsToReview: string[];
  sourceReferences: { claim: string; page: number }[];
  coverageNotes: string[];
  unscannedPages: number[];
  /** Added with content classification; absent on older saved summaries. */
  documentKind?: 'academic' | 'administrative' | 'mixed';
  courseInfo?: CourseInfoItem[];
  /** One or two sentences on what the material teaches. */
  whatItTeaches?: string;
  /** Concrete next practice steps grounded in the source. */
  practiceNext?: string[];
}

export interface SummaryRecord {
  id?: string;
  documentId: string;
  fileName: string;
  mode: SummaryMode;
  summary: StructuredSummary;
  chunkCount: number;
  pagesCovered: number[];
  pagesFailed: number[];
  complete: boolean;
  createdAt: any;
  updatedAt?: any;
}

export interface ConceptCard {
  id: string;
  name: string;
  shortDescription: string;
  detailedExplanation: string;
  sourcePages: number[];
  relatedConcepts: string[];
  definitions: string[];
  example: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  sourcePage?: number;
  known?: boolean;
  needsReview?: boolean;
}

export interface FlashcardDeck {
  id?: string;
  documentId: string;
  fileName: string;
  cards: Flashcard[];
  createdAt: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sourcePages?: number[];
  followUps?: string[];
  usedGeneralKnowledge?: boolean;
  createdAt: string;
}

export interface ChatSession {
  id?: string;
  documentId: string;
  messages: ChatMessage[];
  updatedAt: any;
}

export interface MistakeEntry {
  id?: string;
  documentId?: string;
  question: string;
  originalAnswer: string;
  correctExplanation: string;
  aiFeedback?: string;
  conceptMisunderstood?: string;
  sourcePage?: number;
  confidence?: number;
  dateAttempted: any;
  reviewed: boolean;
  retryStatus: 'pending' | 'retried' | 'reviewed';
}

export interface RevisionTask {
  id?: string;
  topic: string;
  documentId?: string;
  fileName?: string;
  date: string;
  durationMinutes: number;
  masteryEstimate?: number;
  source: 'summary' | 'exam_prep' | 'manual';
  createdAt: any;
  /** Study this after completing the named topic (sequencing). */
  afterTopic?: string | null;
  /** Coach blurb explaining date/duration/order. */
  suggestionReason?: string | null;
  /** Concrete focus for the block. */
  studyFocus?: string | null;
  /** Topic that should come next after this one. */
  nextTopic?: string | null;
}

export interface SummaryProgress {
  stage: string;
  current: number;
  total: number;
  message: string;
}
