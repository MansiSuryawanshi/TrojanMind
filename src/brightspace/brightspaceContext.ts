import { createContext } from 'react';

export const NOT_OWNER_MESSAGE = 'Brightspace connection is available only to the configured local demo account.';

export interface Course {
  id: number;
  name: string;
  code: string | null;
  role: string | null;
  isActive: boolean | null;
  canAccess: boolean | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * idle            – nothing attempted yet
 * connecting      – a request to the local connector is running
 * connected       – courses retrieved and identity confirmed
 * action_required – the person at this computer must do something (e.g. approve Duo)
 * pending         – sign-in still working on its own; check again shortly
 * error           – failed, misconfigured, not the owner, or connector unreachable
 */
export type BrightspaceStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; courses: Course[]; retrievedAt: string }
  | { kind: 'action_required' | 'pending'; message: string }
  | { kind: 'error'; code: string; message: string };

// ── Per-user connection (mirrors server/connections.ts) ─────────────────────

export type ConnectionState = 'not_connected' | 'connecting' | 'connected' | 'expired' | 'error';

/**
 * local_demo – the developer's Brightspace session on this computer (owner only).
 * individual – the user's own Brightspace account (needs a registered OAuth app; not available yet).
 */
export type ConnectionMethod = 'local_demo' | 'individual';

export const LOCAL_DEMO_LABEL = 'Local demo connection';

/**
 * The signed-in user's own Brightspace connection. `method` is null until the
 * server has said which method applies to this UID (or couldn't be reached).
 */
export interface BrightspaceConnection {
  method: ConnectionMethod | null;
  state: ConnectionState;
  /** Whether this method can be started now. False for individual connections in this build. */
  available: boolean;
  /** True while asking the server which method applies. */
  resolving: boolean;
}

// ── Course content (mirrors server/brightspaceMcp.ts) ───────────────────────

/** Where an item lives. A reference only: nothing is fetched from it. */
export type SourceType =
  | 'brightspace_file'
  | 'brightspace_page'
  | 'google_drive_folder'
  | 'google_drive_file'
  | 'google_doc'
  | 'recording_lti'
  | 'external_link'
  | 'unavailable';

export interface ContentTopic {
  kind: 'topic';
  key: string;
  id: number | null;
  title: string;
  topicType: 'file' | 'link' | 'other';
  sourceType: SourceType;
  description: string | null;
  hasInlineContent: boolean;
  url: string | null;
  sourceUrl: string | null;
  lastModified: string | null;
  isHidden: boolean;
  isLocked: boolean;
  isAvailable: boolean;
  availabilityMessage: string | null;
  isCompleted: boolean | null;
  origin: 'topic' | 'module_description';
}

export interface ContentModule {
  kind: 'module';
  id: number;
  title: string;
  description: string | null;
  lastModified: string | null;
  isHidden: boolean;
  isLocked: boolean;
  isAvailable: boolean;
  availabilityMessage: string | null;
  childrenUnavailable: string | null;
  children: (ContentModule | ContentTopic)[];
}

export interface CourseContent {
  course: { id: number; name: string; code: string | null };
  modules: ContentModule[];
  looseTopics: ContentTopic[];
  topicCount: number;
  moduleCount: number;
  notices: string[];
  retrievedAt: string;
}

export type CourseContentResult =
  | { ok: true; content: CourseContent }
  | { ok: false; kind: 'error' | 'action_required' | 'pending'; code: string; message: string };

/** A selected reference to a course item, as kept in application state. */
export interface SelectedMaterial {
  key: string;
  title: string;
  sourceType: SourceType;
  url: string | null;
  sourceUrl: string | null;
  moduleTitle: string;
  topicType: ContentTopic['topicType'];
  origin: ContentTopic['origin'];
}

/** Selected items for one course, by topic key. */
export type CourseSelection = Record<string, SelectedMaterial>;

/** A selection the user confirmed with “Use selected materials”. */
export interface UsedMaterials {
  courseId: number;
  items: SelectedMaterial[];
  savedAt: string;
}

/** One retrieved (or not retrieved) item from POST /brightspace/courses/:id/import. */
export interface ImportedItem {
  index: number;
  key: string;
  topicId: number | null;
  title: string;
  moduleTitle: string;
  sourceType: SourceType;
  url: string | null;
  status: 'imported' | 'link_only' | 'failed';
  reason: string | null;
  method: 'download_file' | 'page_body' | 'google_export' | null;
  text: string | null;
  truncated: boolean;
  pages: number | null;
}

export type ImportEvent =
  | { type: 'start'; course: { id: number; name: string; code: string | null }; total: number }
  | { type: 'item'; item: ImportedItem }
  | { type: 'done' }
  /** Fatal: the import stopped. Items already received are kept. */
  | { type: 'error'; code: string; message: string };

// ── Upcoming dates (mirrors server/brightspaceMcp.ts) ───────────────────────

export type DateKind = 'exam' | 'quiz' | 'other';

export interface UpcomingDate {
  id: string;
  source: string;
  kind: DateKind;
  title: string;
  courseId: number | null;
  courseName: string | null;
  /** ISO 8601 instant. */
  date: string;
  url: string | null;
}

export type UpcomingDatesResult =
  | { ok: true; dates: UpcomingDate[]; retrievedAt: string }
  | { ok: false; code: string; message: string };

// ── Official USC final exams (mirrors server/uscFinals.ts) ──────────────────

export interface OfficialFinal {
  courseId: number;
  courseName: string;
  courseCode: string;
  sectionId: string;
  meeting: string | null;
  /** date YYYY-MM-DD; start/end HH:MM (Los Angeles time). */
  exam: { date: string; start: string; end: string; rule: string } | null;
  reason: string | null;
}

export type OfficialFinalsResult =
  | { ok: true; finals: OfficialFinal[]; sources: { termCode: string; label: string; url: string }[] }
  | { ok: false; code: string; message: string };

export interface BrightspaceContextValue {
  /** Official USC final exam slots for the user's current-term courses. */
  fetchOfficialFinals: (signal?: AbortSignal) => Promise<OfficialFinalsResult>;
  /** Exams, quizzes and other dated items for the next 90 days, across all courses. */
  fetchUpcomingDates: (signal?: AbortSignal) => Promise<UpcomingDatesResult>;
  /** Provider-independent summary of this user's connection. */
  connection: BrightspaceConnection;
  /** Detailed local-demo status. Meaningful only when connection.method === 'local_demo'. */
  status: BrightspaceStatus;
  /** Start (or re-check) the local demo connection. A no-op for any other method. */
  connect: () => void;
  /** Load one course's module/topic tree through the local connector. */
  fetchCourseContent: (courseId: number, signal?: AbortSignal) => Promise<CourseContentResult>;
  /** Current checkbox selections, per course. Scoped to the signed-in user. */
  selections: Record<number, CourseSelection>;
  setCourseSelection: (courseId: number, update: (prev: CourseSelection) => CourseSelection) => void;
  /** Confirmed selections (“Use selected materials”), per course. */
  usedMaterials: Record<number, UsedMaterials>;
  saveUsedMaterials: (courseId: number, items: SelectedMaterial[]) => void;
  /** Import the selected items' readable text; events arrive per item. Resolves when the stream ends. */
  importMaterials: (courseId: number, keys: string[], onEvent: (e: ImportEvent) => void | Promise<void>) => Promise<void>;
}

export const BrightspaceContext = createContext<BrightspaceContextValue | null>(null);
