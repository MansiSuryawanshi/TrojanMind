/**
 * Saved material workspaces: imported Brightspace selections and the learning
 * outputs created from them, stored per signed-in user.
 *
 *   users/{uid}/workspaces/{workspaceId}            metadata + per-item status/preview
 *   users/{uid}/workspaces/{workspaceId}/texts/{i_n} extracted text, ≤200k chars per doc
 *
 * Text is split across chunk documents to stay well under Firestore's 1 MiB
 * document limit. Generated outputs keep living in their existing collections
 * (summaries, flashcardDecks, quizAttempts) and are referenced from here; they
 * are never copied or overwritten.
 */
import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { assertFirebaseConfigured, db } from './firebaseConfig';
import { getDocumentById, getUserId, removeDocument, saveDocument } from './firebaseService';
import type { SourceType } from '../brightspace/brightspaceContext';
import type { PageManifestEntry } from '../types/summary';

export type ItemStatus = 'pending' | 'imported' | 'link_only' | 'failed';

export interface WorkspaceItem {
  index: number;
  key: string;
  topicId: number | null;
  title: string;
  moduleTitle: string;
  sourceType: SourceType;
  url: string | null;
  status: ItemStatus;
  /** Server reason code when there's no text (see server/materialImport.ts). */
  reason: string | null;
  method: 'download_file' | 'page_body' | null;
  charCount: number;
  truncated: boolean;
  pages: number | null;
  chunkCount: number;
  preview: string | null;
}

export interface WorkspaceOutputs {
  summaryIds: string[];
  flashcardDeckIds: string[];
  quizAttemptIds: string[];
  syncedAt: Timestamp | null;
}

export interface Workspace {
  id: string;
  title: string;
  courseId: number;
  courseName: string;
  courseCode: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  importState: 'importing' | 'complete' | 'interrupted';
  importError: string | null;
  items: WorkspaceItem[];
  /** The study document (users/{uid}/documents) the learning features read, once created. */
  studyDocumentId: string | null;
  /** Characters of imported text the study document holds (it may be capped). */
  studyDocumentChars: number;
  studyDocumentTruncated: boolean;
  outputs: WorkspaceOutputs;
}

const CHUNK_CHARS = 200_000;
/** Study document cap: worst-case UTF-8 stays under the 1 MiB document limit. */
const STUDY_DOC_MAX_CHARS = 280_000;
const PREVIEW_CHARS = 600;
const PAGE_CHARS = 3500;

const wsCol = () => collection(db, 'users', getUserId(), 'workspaces');
const wsDoc = (id: string) => doc(db, 'users', getUserId(), 'workspaces', id);
const textsCol = (id: string) => collection(db, 'users', getUserId(), 'workspaces', id, 'texts');

/** A fresh workspace ID, without writing anything. */
export function newWorkspaceId(): string {
  return doc(wsCol()).id;
}

function emptyOutputs(): WorkspaceOutputs {
  return { summaryIds: [], flashcardDeckIds: [], quizAttemptIds: [], syncedAt: null };
}

export function pendingItem(index: number, key: string, title: string, moduleTitle: string, sourceType: SourceType, url: string | null): WorkspaceItem {
  return {
    index, key, topicId: null, title, moduleTitle, sourceType, url, status: 'pending', reason: null, method: null,
    charCount: 0, truncated: false, pages: null, chunkCount: 0, preview: null,
  };
}

export async function createWorkspace(id: string, data: { title: string; courseId: number; courseName: string; courseCode: string | null; items: WorkspaceItem[] }): Promise<void> {
  assertFirebaseConfigured();
  const now = Timestamp.now();
  await setDoc(wsDoc(id), {
    ...data,
    createdAt: now,
    updatedAt: now,
    importState: 'importing',
    importError: null,
    studyDocumentId: null,
    studyDocumentChars: 0,
    studyDocumentTruncated: false,
    outputs: emptyOutputs(),
  });
}

/** Save one item's text (chunked) and then its status. Text is written before the status claims it exists. */
export async function saveImportedItem(id: string, items: WorkspaceItem[], index: number, text: string | null): Promise<WorkspaceItem[]> {
  const next = items.slice();
  const item = { ...next[index] };
  if (text) {
    const batch = writeBatch(db);
    let n = 0;
    for (let i = 0; i < text.length; i += CHUNK_CHARS, n++) {
      batch.set(doc(textsCol(id), `${index}_${n}`), { itemIndex: index, chunk: n, text: text.slice(i, i + CHUNK_CHARS) });
    }
    await batch.commit();
    item.chunkCount = n;
    item.charCount = text.length;
    item.preview = text.slice(0, PREVIEW_CHARS);
  }
  next[index] = item;
  await updateDoc(wsDoc(id), { items: next, updatedAt: Timestamp.now() });
  return next;
}

/** Record the final item list and import state. */
export async function finishImport(id: string, items: WorkspaceItem[], state: 'complete' | 'interrupted', error: string | null): Promise<void> {
  await updateDoc(wsDoc(id), { items, importState: state, importError: error, updatedAt: Timestamp.now() });
}

function toWorkspace(id: string, d: Record<string, unknown>): Workspace {
  const outputs = (d.outputs ?? {}) as Partial<WorkspaceOutputs>;
  return {
    id,
    title: typeof d.title === 'string' ? d.title : 'Untitled workspace',
    courseId: typeof d.courseId === 'number' ? d.courseId : 0,
    courseName: typeof d.courseName === 'string' ? d.courseName : '',
    courseCode: typeof d.courseCode === 'string' ? d.courseCode : null,
    createdAt: (d.createdAt as Timestamp) ?? null,
    updatedAt: (d.updatedAt as Timestamp) ?? null,
    importState: d.importState === 'complete' || d.importState === 'interrupted' ? d.importState : 'importing',
    importError: typeof d.importError === 'string' ? d.importError : null,
    items: Array.isArray(d.items) ? (d.items as WorkspaceItem[]) : [],
    studyDocumentId: typeof d.studyDocumentId === 'string' ? d.studyDocumentId : null,
    studyDocumentChars: typeof d.studyDocumentChars === 'number' ? d.studyDocumentChars : 0,
    studyDocumentTruncated: d.studyDocumentTruncated === true,
    outputs: {
      summaryIds: outputs.summaryIds ?? [],
      flashcardDeckIds: outputs.flashcardDeckIds ?? [],
      quizAttemptIds: outputs.quizAttemptIds ?? [],
      syncedAt: outputs.syncedAt ?? null,
    },
  };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  assertFirebaseConfigured();
  const snap = await getDocs(query(wsCol(), orderBy('updatedAt', 'desc')));
  return snap.docs.map((d) => toWorkspace(d.id, d.data()));
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  assertFirebaseConfigured();
  const snap = await getDoc(wsDoc(id));
  return snap.exists() ? toWorkspace(snap.id, snap.data()) : null;
}

/** Full saved text per item index. Read from Firestore only: no Brightspace connection needed. */
export async function loadWorkspaceTexts(id: string): Promise<Map<number, string>> {
  const snap = await getDocs(textsCol(id));
  const parts = new Map<number, { chunk: number; text: string }[]>();
  for (const d of snap.docs) {
    const v = d.data() as { itemIndex?: unknown; chunk?: unknown; text?: unknown };
    if (typeof v.itemIndex !== 'number' || typeof v.chunk !== 'number' || typeof v.text !== 'string') continue;
    const list = parts.get(v.itemIndex) ?? [];
    list.push({ chunk: v.chunk, text: v.text });
    parts.set(v.itemIndex, list);
  }
  const out = new Map<number, string>();
  for (const [i, list] of parts) out.set(i, list.sort((a, b) => a.chunk - b.chunk).map((p) => p.text).join(''));
  return out;
}

/** Split text into pages of ~PAGE_CHARS at paragraph boundaries. */
function paginate(text: string): string[] {
  const pages: string[] = [];
  let cur = '';
  for (const para of text.split(/\n{2,}/)) {
    if (cur && cur.length + para.length + 2 > PAGE_CHARS) {
      pages.push(cur);
      cur = '';
    }
    if (para.length > PAGE_CHARS) {
      for (let i = 0; i < para.length; i += PAGE_CHARS) pages.push(para.slice(i, i + PAGE_CHARS));
    } else {
      cur = cur ? `${cur}\n\n${para}` : para;
    }
  }
  if (cur) pages.push(cur);
  return pages;
}

/**
 * The study document the existing learning features read (Summary, practice,
 * challenge). Created once from the imported text and then reused, so opening
 * a workspace never regenerates or re-imports anything.
 */
export async function ensureStudyDocument(ws: Workspace, texts: Map<number, string>): Promise<{ documentId: string; workspace: Workspace }> {
  if (ws.studyDocumentId && (await getDocumentById(ws.studyDocumentId))) {
    return { documentId: ws.studyDocumentId, workspace: ws };
  }
  const pages: string[] = [];
  let used = 0;
  let truncated = false;
  for (const item of ws.items) {
    const text = texts.get(item.index);
    if (item.status !== 'imported' || !text) continue;
    for (const p of paginate(text)) {
      const page = `Source: ${item.title}\n${p}`;
      if (used + page.length > STUDY_DOC_MAX_CHARS) {
        truncated = true;
        break;
      }
      pages.push(page);
      used += page.length;
    }
    if (truncated) break;
  }
  if (pages.length === 0) throw new Error('This workspace has no imported text yet.');

  const rawText = pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join('\n\n');
  const pageManifest: PageManifestEntry[] = pages.map((p, i) => ({ page: i + 1, charCount: p.length, isEmpty: false, likelyScanned: false, processed: true }));
  const documentId = await saveDocument(ws.title, rawText, { pageCount: pages.length, pageManifest, processed: true });
  await updateDoc(wsDoc(ws.id), { studyDocumentId: documentId, studyDocumentChars: used, studyDocumentTruncated: truncated, updatedAt: Timestamp.now() });
  return { documentId, workspace: { ...ws, studyDocumentId: documentId, studyDocumentChars: used, studyDocumentTruncated: truncated } };
}

export interface LinkedOutputs {
  summaries: { id: string; mode: string; createdAt: Timestamp | null }[];
  flashcardDecks: { id: string; cardCount: number; createdAt: Timestamp | null }[];
  quizAttempts: { id: string; accuracy: number; totalQuestions: number; createdAt: Timestamp | null }[];
}

/**
 * Outputs created from this workspace's study document, read from their own
 * collections, and the references recorded on the workspace.
 */
export async function syncLinkedOutputs(ws: Workspace): Promise<LinkedOutputs> {
  const empty: LinkedOutputs = { summaries: [], flashcardDecks: [], quizAttempts: [] };
  if (!ws.studyDocumentId) return empty;
  const uid = getUserId();
  const docId = ws.studyDocumentId;
  const ts = (v: unknown) => (v instanceof Timestamp ? v : null);
  const byNewest = <T extends { createdAt: Timestamp | null }>(a: T, b: T) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
  // Equality filters only, so no composite index is needed.
  const [sums, decks, attempts] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'summaries'), where('documentId', '==', docId))),
    getDocs(query(collection(db, 'users', uid, 'flashcardDecks'), where('documentId', '==', docId))),
    getDocs(query(collection(db, 'users', uid, 'quizAttempts'), where('selectedDocumentIds', 'array-contains', docId))),
  ]);
  const out: LinkedOutputs = {
    summaries: sums.docs.map((d) => ({ id: d.id, mode: String(d.data().mode ?? ''), createdAt: ts(d.data().createdAt) })).sort(byNewest),
    flashcardDecks: decks.docs.map((d) => ({ id: d.id, cardCount: Array.isArray(d.data().cards) ? d.data().cards.length : 0, createdAt: ts(d.data().createdAt) })).sort(byNewest),
    quizAttempts: attempts.docs.map((d) => ({
      id: d.id,
      accuracy: Number(d.data().accuracy ?? 0),
      totalQuestions: Number(d.data().totalQuestions ?? 0),
      createdAt: ts(d.data().createdAt),
    })).sort(byNewest),
  };
  const ids = (l: { id: string }[]) => l.map((x) => x.id);
  const changed =
    ids(out.summaries).join() !== ws.outputs.summaryIds.join() ||
    ids(out.flashcardDecks).join() !== ws.outputs.flashcardDeckIds.join() ||
    ids(out.quizAttempts).join() !== ws.outputs.quizAttemptIds.join();
  if (changed) {
    await updateDoc(wsDoc(ws.id), {
      outputs: { summaryIds: ids(out.summaries), flashcardDeckIds: ids(out.flashcardDecks), quizAttemptIds: ids(out.quizAttempts), syncedAt: Timestamp.now() },
      updatedAt: Timestamp.now(),
    });
  }
  return out;
}

/**
 * Delete a workspace, its saved text, and the study document made from it.
 * Summaries, flashcards, and quiz results already in the user's history are kept.
 */
export async function deleteWorkspace(id: string): Promise<void> {
  assertFirebaseConfigured();
  const ws = await getWorkspace(id);
  const texts = await getDocs(textsCol(id));
  for (let i = 0; i < texts.docs.length; i += 400) {
    const batch = writeBatch(db);
    texts.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  if (ws?.studyDocumentId) {
    try {
      await removeDocument(ws.studyDocumentId);
    } catch {
      /* already gone */
    }
  }
  await deleteDoc(wsDoc(id));
}
