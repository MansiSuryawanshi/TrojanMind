/**
 * Per-user Piazza Assistant persistence under users/{uid}/...
 * Never stores Piazza credentials.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { assertFirebaseConfigured, db } from './firebaseConfig';
import { getUserId } from './firebaseService';
import type {
  PiazzaAssistantPreferences,
  PiazzaCourseMapping,
  PiazzaNotification,
  PiazzaNotificationType,
  PiazzaPostSummary,
  PiazzaSyncState,
} from '../types/piazza';

const prefsRef = () => doc(db, 'users', getUserId(), 'piazzaAssistantPreferences', 'settings');
const mappingsCol = () => collection(db, 'users', getUserId(), 'piazzaCourseMappings');
const notifCol = () => collection(db, 'users', getUserId(), 'piazzaNotifications');
const syncRef = (courseId: string) => doc(db, 'users', getUserId(), 'piazzaSyncState', courseId);
const postCacheRef = (courseId: string, postKey: string) =>
  doc(db, 'users', getUserId(), 'piazzaPostCache', `${courseId}_${postKey}`);

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

const defaultPrefs = (): PiazzaAssistantPreferences => ({
  selectedCourseId: null,
  followCurrentCourse: true,
  panelOpen: false,
  pinnedManually: false,
});

export async function loadPiazzaPreferences(): Promise<PiazzaAssistantPreferences> {
  assertFirebaseConfigured();
  const snap = await getDoc(prefsRef());
  if (!snap.exists()) return defaultPrefs();
  const d = snap.data();
  return {
    selectedCourseId: typeof d.selectedCourseId === 'string' ? d.selectedCourseId : null,
    followCurrentCourse: d.followCurrentCourse !== false,
    panelOpen: d.panelOpen === true,
    pinnedManually: d.pinnedManually === true,
  };
}

export async function savePiazzaPreferences(patch: Partial<PiazzaAssistantPreferences>): Promise<void> {
  assertFirebaseConfigured();
  const current = await loadPiazzaPreferences();
  await setDoc(prefsRef(), stripUndefined({ ...current, ...patch, updatedAt: new Date().toISOString() }), { merge: true });
}

export async function listPiazzaMappings(): Promise<PiazzaCourseMapping[]> {
  assertFirebaseConfigured();
  const snap = await getDocs(mappingsCol());
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      trojanMindCourseId: typeof x.trojanMindCourseId === 'number' ? x.trojanMindCourseId : null,
      trojanMindCourseCode: typeof x.trojanMindCourseCode === 'string' ? x.trojanMindCourseCode : null,
      piazzaCourseId: String(x.piazzaCourseId ?? ''),
      courseName: String(x.courseName ?? ''),
      updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : new Date().toISOString(),
    };
  }).filter((m) => m.piazzaCourseId);
}

export async function upsertPiazzaMapping(mapping: Omit<PiazzaCourseMapping, 'id' | 'updatedAt'> & { id?: string }): Promise<string> {
  assertFirebaseConfigured();
  const id = mapping.id || `${mapping.piazzaCourseId}_${mapping.trojanMindCourseId ?? 'manual'}`;
  await setDoc(
    doc(mappingsCol(), id),
    stripUndefined({
      trojanMindCourseId: mapping.trojanMindCourseId,
      trojanMindCourseCode: mapping.trojanMindCourseCode,
      piazzaCourseId: mapping.piazzaCourseId,
      courseName: mapping.courseName,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true },
  );
  return id;
}

export async function loadSyncState(courseId: string): Promise<PiazzaSyncState> {
  assertFirebaseConfigured();
  const snap = await getDoc(syncRef(courseId));
  if (!snap.exists()) {
    return {
      courseId,
      lastSuccessfulSync: null,
      baselineEstablished: false,
      status: 'idle',
      error: null,
      knownVersions: {},
    };
  }
  const d = snap.data();
  return {
    courseId,
    lastSuccessfulSync: typeof d.lastSuccessfulSync === 'string' ? d.lastSuccessfulSync : null,
    baselineEstablished: d.baselineEstablished === true,
    status: d.status === 'syncing' || d.status === 'ok' || d.status === 'error' ? d.status : 'idle',
    error: typeof d.error === 'string' ? d.error : null,
    knownVersions: d.knownVersions && typeof d.knownVersions === 'object' ? (d.knownVersions as Record<string, string>) : {},
  };
}

export async function saveSyncState(state: PiazzaSyncState): Promise<void> {
  assertFirebaseConfigured();
  await setDoc(syncRef(state.courseId), stripUndefined({ ...state }), { merge: true });
}

export async function cachePostSnapshot(courseId: string, post: PiazzaPostSummary): Promise<void> {
  assertFirebaseConfigured();
  const key = post.nr != null ? String(post.nr) : post.id;
  await setDoc(
    postCacheRef(courseId, key),
    stripUndefined({
      courseId,
      postId: post.id,
      postNr: post.nr,
      subject: post.subject,
      snippet: post.snippet,
      type: post.type,
      hasInstructorAnswer: post.hasInstructorAnswer,
      hasStudentAnswer: post.hasStudentAnswer,
      isAnnouncement: post.isAnnouncement,
      sourceVersion: post.sourceVersion,
      url: post.url,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true },
  );
}

function notifId(courseId: string, postKey: string, type: PiazzaNotificationType, version: string): string {
  const safe = `${courseId}_${postKey}_${type}_${version}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 700);
  return safe;
}

export async function createNotificationIfNew(
  n: Omit<PiazzaNotification, 'id' | 'seenAt' | 'createdAt'> & { createdAt?: string },
): Promise<boolean> {
  assertFirebaseConfigured();
  const postKey = n.postNr != null ? String(n.postNr) : n.postId;
  const id = notifId(n.courseId, postKey, n.notificationType, n.sourceVersion);
  const ref = doc(notifCol(), id);
  const existing = await getDoc(ref);
  if (existing.exists()) return false;
  await setDoc(
    ref,
    stripUndefined({
      ...n,
      id,
      createdAt: n.createdAt ?? new Date().toISOString(),
      seenAt: null,
    }),
  );
  return true;
}

export async function listNotifications(courseId?: string | null, max = 60): Promise<PiazzaNotification[]> {
  assertFirebaseConfigured();
  let q = query(notifCol(), orderBy('createdAt', 'desc'), limit(max));
  if (courseId) {
    q = query(notifCol(), where('courseId', '==', courseId), orderBy('createdAt', 'desc'), limit(max));
  }
  try {
    const snap = await getDocs(q);
    return snap.docs.map(mapNotification);
  } catch {
    // Fallback without composite index: fetch recent and filter client-side.
    const snap = await getDocs(query(notifCol(), orderBy('createdAt', 'desc'), limit(120)));
    const all = snap.docs.map(mapNotification);
    return (courseId ? all.filter((n) => n.courseId === courseId) : all).slice(0, max);
  }
}

function mapNotification(d: { id: string; data: () => DocumentData }): PiazzaNotification {
  const x = d.data();
  return {
    id: d.id,
    courseId: String(x.courseId ?? ''),
    courseName: String(x.courseName ?? ''),
    postId: String(x.postId ?? ''),
    postNr: typeof x.postNr === 'number' ? x.postNr : null,
    notificationType: (x.notificationType as PiazzaNotificationType) || 'new_discussion',
    title: String(x.title ?? ''),
    excerpt: String(x.excerpt ?? ''),
    verifiedSourceUrl: String(x.verifiedSourceUrl ?? ''),
    createdAt: typeof x.createdAt === 'string' ? x.createdAt : new Date().toISOString(),
    seenAt: typeof x.seenAt === 'string' ? x.seenAt : null,
    sourceVersion: String(x.sourceVersion ?? ''),
    authorRole: x.authorRole === 'instructor' || x.authorRole === 'student' || x.authorRole === 'unknown' ? x.authorRole : null,
  };
}

export async function markNotificationSeen(id: string): Promise<void> {
  assertFirebaseConfigured();
  await updateDoc(doc(notifCol(), id), { seenAt: new Date().toISOString() });
}

export async function markAllNotificationsSeen(courseId: string): Promise<void> {
  const list = await listNotifications(courseId, 100);
  await Promise.all(list.filter((n) => !n.seenAt).map((n) => markNotificationSeen(n.id)));
}

export async function unseenNotificationCount(courseId?: string | null): Promise<number> {
  const list = await listNotifications(courseId ?? null, 80);
  return list.filter((n) => !n.seenAt).length;
}

/** Normalize course codes like "DSCI-554" / "DSCI 554" for fuzzy mapping. */
export function normalizeCourseCode(code: string | null | undefined): string {
  return String(code ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function matchPiazzaClassToStudy(
  classes: { id: string; name: string; courseNumber: string | null }[],
  study: { brightspaceCourseId?: number; courseCode: string | null; courseName: string } | null,
  mappings: PiazzaCourseMapping[],
): string | null {
  if (!study) return null;

  if (study.brightspaceCourseId != null) {
    const mapped = mappings.find((m) => m.trojanMindCourseId === study.brightspaceCourseId);
    if (mapped?.piazzaCourseId) return mapped.piazzaCourseId;
  }

  const code = normalizeCourseCode(study.courseCode);
  const nameNorm = normalizeCourseCode(study.courseName);

  for (const m of mappings) {
    if (m.trojanMindCourseCode && code && normalizeCourseCode(m.trojanMindCourseCode) === code) {
      return m.piazzaCourseId;
    }
  }

  for (const c of classes) {
    const pn = normalizeCourseCode(c.courseNumber);
    if (code && pn && (pn === code || pn.includes(code) || code.includes(pn))) return c.id;
    const cn = normalizeCourseCode(`${c.courseNumber ?? ''} ${c.name}`);
    if (nameNorm && cn && (cn.includes(nameNorm) || nameNorm.includes(cn))) return c.id;
  }
  return null;
}
