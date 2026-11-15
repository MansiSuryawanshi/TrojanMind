/** Piazza Assistant types (client-side). */

export type PiazzaConnectionState = 'not_connected' | 'connecting' | 'connected' | 'expired' | 'error' | 'pending';

export interface PiazzaClass {
  id: string;
  name: string;
  courseNumber: string | null;
  term: string | null;
  folders: string[];
  isActive: boolean;
}

export interface PiazzaPostSummary {
  id: string;
  nr: number | null;
  subject: string;
  snippet: string;
  type: string;
  folders: string[];
  hasInstructorAnswer: boolean;
  hasStudentAnswer: boolean;
  unanswered: boolean;
  pinned: boolean;
  isAnnouncement: boolean;
  modifiedAt: string | null;
  createdAt: string | null;
  url: string;
  sourceVersion: string;
}

export interface PiazzaAnswer {
  type: 'instructor' | 'student';
  text: string;
  endorsedByInstructor: boolean;
  updatedAt: string | null;
}

export interface PiazzaPostDetail extends PiazzaPostSummary {
  body: string;
  answers: PiazzaAnswer[];
  followups: { text: string; createdAt: string | null }[];
}

export type PiazzaNotificationType =
  | 'new_discussion'
  | 'new_question'
  | 'new_answer'
  | 'instructor_answer'
  | 'instructor_endorsed'
  | 'announcement'
  | 'announcement_edit'
  | 'deadline_alert';

export interface PiazzaNotification {
  id: string;
  courseId: string;
  courseName: string;
  postId: string;
  postNr: number | null;
  notificationType: PiazzaNotificationType;
  title: string;
  excerpt: string;
  verifiedSourceUrl: string;
  createdAt: string;
  seenAt: string | null;
  sourceVersion: string;
  authorRole: 'instructor' | 'student' | 'unknown' | null;
}

export interface PiazzaCourseMapping {
  id: string;
  trojanMindCourseId: number | null;
  trojanMindCourseCode: string | null;
  piazzaCourseId: string;
  courseName: string;
  updatedAt: string;
}

export interface PiazzaSyncState {
  courseId: string;
  lastSuccessfulSync: string | null;
  baselineEstablished: boolean;
  status: 'idle' | 'syncing' | 'ok' | 'error';
  error: string | null;
  knownVersions: Record<string, string>;
}

export interface PiazzaAssistantPreferences {
  selectedCourseId: string | null;
  followCurrentCourse: boolean;
  panelOpen: boolean;
  pinnedManually: boolean;
}

export interface StudyCourseContext {
  brightspaceCourseId: number;
  courseName: string;
  courseCode: string | null;
  workspaceId?: string;
}

export interface PiazzaAskMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; url: string; postNr: number | null }[];
  at: string;
}
