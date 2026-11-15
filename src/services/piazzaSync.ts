/**
 * Application-side Piazza notification sync (not native Piazza push/unread).
 * Baseline on first sync; subsequent syncs create deduped notifications.
 */
import { fetchPiazzaPosts } from './piazzaApi';
import {
  cachePostSnapshot,
  createNotificationIfNew,
  loadSyncState,
  saveSyncState,
} from './piazzaFirebase';
import type { PiazzaClass, PiazzaNotificationType, PiazzaPostSummary } from '../types/piazza';

const DEADLINE_RE =
  /\b(midterm|final|exam|deadline|due\s+date|due\s+by|extended?\s+to|postponed|reschedul)/i;

export interface SyncResult {
  ok: boolean;
  created: number;
  posts: PiazzaPostSummary[];
  coverageNote: string;
  lastSuccessfulSync: string | null;
  error: string | null;
}

function classifyChange(
  prev: string | undefined,
  post: PiazzaPostSummary,
): PiazzaNotificationType | null {
  if (!prev) {
    if (post.isAnnouncement) return 'announcement';
    if (post.type === 'note' && post.pinned) return 'announcement';
    if (post.type === 'question') return 'new_question';
    return 'new_discussion';
  }
  if (prev === post.sourceVersion) return null;

  // Version string encodes children + instructor/student answer flags.
  const prevHasI = /\|i1\|/.test(prev);
  const nowHasI = post.hasInstructorAnswer;
  if (!prevHasI && nowHasI) return 'instructor_answer';

  const prevHasS = /\|s1\|/.test(prev);
  if (!prevHasS && post.hasStudentAnswer && !nowHasI) return 'new_answer';

  if (post.isAnnouncement) return 'announcement_edit';
  if (DEADLINE_RE.test(`${post.subject} ${post.snippet}`)) return 'deadline_alert';
  return 'new_discussion';
}

function notificationCopy(
  type: PiazzaNotificationType,
  courseName: string,
  post: PiazzaPostSummary,
): { title: string; excerpt: string; authorRole: 'instructor' | 'student' | 'unknown' | null } {
  switch (type) {
    case 'instructor_answer':
      return {
        title: 'New instructor answer',
        excerpt: `An instructor answered: “${post.subject}”`,
        authorRole: 'instructor',
      };
    case 'instructor_endorsed':
      return {
        title: 'Instructor-endorsed answer',
        excerpt: post.subject,
        authorRole: 'instructor',
      };
    case 'announcement':
      return {
        title: 'New course announcement detected',
        excerpt: post.snippet || post.subject,
        authorRole: null,
      };
    case 'announcement_edit':
      return {
        title: 'Announcement updated',
        excerpt: post.snippet || post.subject,
        authorRole: null,
      };
    case 'deadline_alert':
      return {
        title: 'Possible deadline / exam date change detected',
        excerpt: post.snippet || post.subject,
        authorRole: null,
      };
    case 'new_question':
      return {
        title: `New Piazza question in ${courseName}`,
        excerpt: post.subject,
        authorRole: 'unknown',
      };
    case 'new_answer':
      return {
        title: 'New answer available',
        excerpt: post.subject,
        authorRole: 'student',
      };
    default:
      return {
        title: `New Piazza discussion in ${courseName}`,
        excerpt: post.subject,
        authorRole: 'unknown',
      };
  }
}

export async function syncPiazzaCourse(course: PiazzaClass): Promise<SyncResult> {
  const state = await loadSyncState(course.id);
  await saveSyncState({ ...state, status: 'syncing', error: null });

  try {
    const { posts, coverageNote } = await fetchPiazzaPosts(course.id, { limit: 40 });
    const known = { ...state.knownVersions };
    let created = 0;
    const baseline = state.baselineEstablished;

    for (const post of posts) {
      const key = post.nr != null ? String(post.nr) : post.id;
      if (!key) continue;
      await cachePostSnapshot(course.id, post);

      const prev = known[key];
      if (!baseline) {
        known[key] = post.sourceVersion;
        continue;
      }

      const change = classifyChange(prev, post);
      known[key] = post.sourceVersion;
      if (!change) continue;

      // Only label instructor when we have verified instructor-answer flag.
      if (change === 'instructor_answer' && !post.hasInstructorAnswer) continue;

      let type = change;
      if (
        (type === 'announcement' || type === 'announcement_edit') &&
        DEADLINE_RE.test(`${post.subject} ${post.snippet}`)
      ) {
        type = 'deadline_alert';
      }

      const copy = notificationCopy(type, course.courseNumber ? `${course.courseNumber} — ${course.name}` : course.name, post);
      const made = await createNotificationIfNew({
        courseId: course.id,
        courseName: course.courseNumber ? `${course.courseNumber} — ${course.name}` : course.name,
        postId: post.id,
        postNr: post.nr,
        notificationType: type,
        title: copy.title,
        excerpt: copy.excerpt,
        verifiedSourceUrl: post.url,
        sourceVersion: post.sourceVersion,
        authorRole: copy.authorRole,
      });
      if (made) created += 1;
    }

    const now = new Date().toISOString();
    await saveSyncState({
      courseId: course.id,
      lastSuccessfulSync: now,
      baselineEstablished: true,
      status: 'ok',
      error: null,
      knownVersions: known,
    });

    return {
      ok: true,
      created,
      posts,
      coverageNote,
      lastSuccessfulSync: now,
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Piazza sync unavailable';
    await saveSyncState({
      ...state,
      status: 'error',
      error: message,
    });
    return {
      ok: false,
      created: 0,
      posts: [],
      coverageNote: '',
      lastSuccessfulSync: state.lastSuccessfulSync,
      error: message,
    };
  }
}
