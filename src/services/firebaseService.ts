import { 
  collection, 
  addDoc, 
  getDoc, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  setDoc,
  deleteDoc,
  where,
  onSnapshot,
  updateDoc,
  Timestamp 
} from "firebase/firestore";

import { assertFirebaseConfigured, auth, db } from "./firebaseConfig";
import type {
  QuizAttempt,
  ChallengeSession,
  Participant,
  StudyDocument as StudyDocumentType,
} from "../types";
import type {
  SummaryRecord,
  ChatSession,
  FlashcardDeck,
  MistakeEntry,
  RevisionTask,
  PageManifestEntry,
} from "../types/summary";

/**
 * All user data lives under users/{Firebase Auth UID}. The UID is read from
 * the signed-in session on every call (never cached), so data can't carry
 * over between accounts and nothing is written while signed out.
 * Earlier builds wrote to a shared "users/guest_user" path; that data is left
 * untouched in Firestore but is no longer read or written.
 */
export function getUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to TrojanMind first.");
  return uid;
}

export interface StudyDocument {
  id?: string;
  fileName: string;
  uploadedAt: any;
  rawText: string;
  extractedTopics?: string[];
  processed: boolean;
  pageCount?: number;
  emptyPages?: number[];
  scannedPages?: number[];
  pageManifest?: PageManifestEntry[];
}

export interface SaveDocumentMeta {
  pageCount?: number;
  emptyPages?: number[];
  scannedPages?: number[];
  pageManifest?: PageManifestEntry[];
  extractedTopics?: string[];
  processed?: boolean;
}

/**
 * Saves a new study document to Firebase Firestore.
 */
export async function saveDocument(
  fileName: string,
  rawText: string,
  meta: SaveDocumentMeta = {}
): Promise<string> {
  assertFirebaseConfigured();
  const path = `users/${getUserId()}/documents`;
  console.group(`[Firebase-WRITE] ${path}`);
  console.log(`[Firebase-Step 1] Initializing document structure...`);
  try {
    const userDocsRef = collection(db, "users", getUserId(), "documents");
    const newDoc = {
      fileName,
      rawText,
      uploadedAt: Timestamp.now(),
      processed: meta.processed ?? Boolean(rawText.trim()),
      extractedTopics: meta.extractedTopics ?? [],
      pageCount: meta.pageCount ?? 1,
      emptyPages: meta.emptyPages ?? [],
      scannedPages: meta.scannedPages ?? [],
      pageManifest: meta.pageManifest ?? [],
    };
    
    console.log(`[Firebase-Step 2] Calling addDoc()...`);
    const docRef = await addDoc(userDocsRef, newDoc);
    console.log(`[Firebase-Step 2.Success] DocID: ${docRef.id} | Size: ${rawText.length} chars`);
    
    console.log(`[Firebase-Step 3] Updating activeDocumentId...`);
    await setDoc(doc(db, "users", getUserId()), { activeDocumentId: docRef.id }, { merge: true });
    console.log(`[Firebase-Step 3.Success] activeDocumentId grounded.`);
    
    console.groupEnd();
    return docRef.id;
  } catch (error: any) {
    console.error(`[Firebase-Step.FAIL] Upload failed:`, error);
    console.groupEnd();
    throw error;
  }
}

export async function markDocumentProcessed(
  docId: string,
  updates: Partial<StudyDocumentType> = {}
): Promise<void> {
  assertFirebaseConfigured();
  const docRef = doc(db, "users", getUserId(), "documents", docId);
  await updateDoc(docRef, { processed: true, ...updates });
}

/**
 * Fetches the currently active document ID for the user.
 */
export async function getActiveDocumentId(): Promise<string | null> {
  const path = `users/${getUserId()} (activeDocumentId)`;
  console.group(`[Firebase-READ] ${path}`);
  try {
    const userRef = doc(db, "users", getUserId());
    const userSnap = await getDoc(userRef);
    const result = userSnap.exists() ? (userSnap.data().activeDocumentId || null) : null;
    console.log(`Result: ${result}`);
    console.groupEnd();
    return result;
  } catch (error) {
    console.error("Fetch failed:", error);
    console.groupEnd();
    return null;
  }
}

/**
 * Retrieves the full study document based on its ID.
 */
export async function getDocumentById(docId: string): Promise<StudyDocument | null> {
  const path = `users/${getUserId()}/documents/${docId}`;
  console.group(`[Firebase-READ] ${path}`);
  try {
    const docRef = doc(db, "users", getUserId(), "documents", docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const result = { id: docSnap.id, ...docSnap.data() } as StudyDocument;
      console.log(`Success: ${result.fileName}`);
      console.groupEnd();
      return result;
    }
    console.log("Not found.");
    console.groupEnd();
    return null;
  } catch (error) {
    console.error("Fetch failed:", error);
    console.groupEnd();
    return null;
  }
}

/**
 * Saves the user's target exam date to Firestore.
 */
export async function saveExamDate(dateStr: string): Promise<void> {
  const path = `users/${getUserId()} (examDate)`;
  console.group(`[Firebase-WRITE] ${path}`);
  try {
    const userRef = doc(db, "users", getUserId());
    await setDoc(userRef, { examDate: dateStr }, { merge: true });
    console.log(`Saved: ${dateStr}`);
    console.groupEnd();
  } catch (error) {
    console.error("Save failed:", error);
    console.groupEnd();
    throw error;
  }
}

/**
 * Fetches the user's target exam date from Firestore.
 */
export async function getExamDate(): Promise<string | null> {
  const path = `users/${getUserId()} (examDate)`;
  console.group(`[Firebase-READ] ${path}`);
  try {
    const userRef = doc(db, "users", getUserId());
    const userSnap = await getDoc(userRef);
    const result = userSnap.exists() ? (userSnap.data().examDate || null) : null;
    console.log(`Result: ${result}`);
    console.groupEnd();
    return result;
  } catch (error) {
    console.error("Fetch failed:", error);
    console.groupEnd();
    return null;
  }
}

/**
 * Lists all documents for the current user, ordered by upload time.
 */
export async function listUserDocuments(): Promise<StudyDocument[]> {
  const path = `users/${getUserId()}/documents`;
  console.group(`[Firebase-READ] ${path}`);
  try {
    const userDocsRef = collection(db, "users", getUserId(), "documents");
    const q = query(userDocsRef, orderBy("uploadedAt", "desc"));
    const querySnapshot = await getDocs(q);
    console.log(`Documents Loaded: ${querySnapshot.docs.length}`);
    const results = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as StudyDocument));
    console.groupEnd();
    return results;
  } catch (error) {
    console.error("List failed:", error);
    console.groupEnd();
    return [];
  }
}

/**
 * Saves a completed quiz attempt to Firebase Firestore.
 */
export async function saveQuizAttempt(attempt: Omit<QuizAttempt, "id" | "createdAt"> & { createdAt?: any }): Promise<string | null> {
  const path = `users/${getUserId()}/quizAttempts`;
  console.group(`[Firebase-WRITE] ${path}`);
  try {
    const attemptsRef = collection(db, "users", getUserId(), "quizAttempts");
    const payload = {
      ...attempt,
      createdAt: Timestamp.now()
    };
    console.log("Payload:", payload);
    const docRef = await addDoc(attemptsRef, payload);
    console.log(`Success. DocID: ${docRef.id}`);
    console.groupEnd();
    return docRef.id;
  } catch (error) {
    console.error("Save Failed:", error);
    console.groupEnd();
    return null;
  }
}

/**
 * Retrieves all quiz attempts for the current user.
 */
export async function getUserQuizAttempts(): Promise<QuizAttempt[]> {
  const path = `users/${getUserId()}/quizAttempts`;
  console.group(`[Firebase-READ] ${path}`);
  try {
    const attemptsRef = collection(db, "users", getUserId(), "quizAttempts");
    const q = query(attemptsRef, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    console.log(`Documents Loaded: ${querySnapshot.docs.length}`);
    const results = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as QuizAttempt));
    console.groupEnd();
    return results;
  } catch (error: any) {
    console.error(`Fetch Failed. Reason:`, error.message || error);
    console.groupEnd();
    return [];
  }
}

/**
 * Saves a Socratic Cross-Examination defense to Firebase.
 */
export async function saveCrossExamAttempt(attempt: any): Promise<string | null> {
  console.group("[Firebase] Save Cross-Exam Defense");
  try {
    const path = `users/${getUserId()}/crossExams`;
    console.log(`Target Path: ${path}`);
    const attemptsRef = collection(db, "users", getUserId(), "crossExams");
    const docRef = await addDoc(attemptsRef, {
      ...attempt,
      createdAt: Timestamp.now()
    });
    console.log(`Save Successful. DocID: ${docRef.id}`);
    console.groupEnd();
    return docRef.id;
  } catch (error) {
    console.error(`Save Failed for ${`users/${getUserId()}/crossExams`}:`, error);
    console.groupEnd();
    return null;
  }
}

/**
 * Removes a single study document and clears activeDocumentId if needed.
 */
export async function removeDocument(docId: string): Promise<void> {
  try {
    const docRef = doc(db, "users", getUserId(), "documents", docId);
    const activeId = await getActiveDocumentId();
    if (activeId === docId) {
      await setDoc(doc(db, "users", getUserId()), { activeDocumentId: null }, { merge: true });
    }
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`[Firebase] Error removing document ${docId}: `, error);
    throw error;
  }
}

/**
 * Bulk removes multiple documents.
 */
export async function removeDocuments(docIds: string[]): Promise<void> {
  try {
    const activeId = await getActiveDocumentId();
    let activeCleared = false;
    const promises = docIds.map(async (id) => {
      const docRef = doc(db, "users", getUserId(), "documents", id);
      if (id === activeId) activeCleared = true;
      return deleteDoc(docRef);
    });
    await Promise.all(promises);
    if (activeCleared) {
      await setDoc(doc(db, "users", getUserId()), { activeDocumentId: null }, { merge: true });
    }
  } catch (error) {
    console.error("[Firebase] Error in bulk removal: ", error);
    throw error;
  }
}

// ── Multi-player / Challenge Sessions ─────────────────────────────────────────────

/**
 * Creates a new reasoning challenge session (multiplayer room).
 */
export async function createChallengeSession(
  hostId: string, 
  hostName: string, 
  docIds: string[], 
  docNames: string[],
  questionCount: number
): Promise<ChallengeSession | null> {
  console.log(`[Firebase] Creating session for ${hostName}`);
  
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const sessionRef = collection(db, "sessions");
  
  const participant: Participant = {
    uid: hostId,
    name: hostName,
    isHost: true,
    joinedAt: Timestamp.now(),
    status: 'answering'
  };

  const sessionData: Omit<ChallengeSession, "id"> = {
    roomCode,
    hostId,
    docIds,
    docNames,
    questionCount,
    status: 'waiting',
    questions: [],
    participants: { [hostId]: participant },
    createdAt: Timestamp.now()
  };

  try {
    const docRef = await addDoc(sessionRef, sessionData);
    return { id: docRef.id, ...sessionData } as ChallengeSession;
  } catch (error) {
    console.error("[Firebase] Error creating session: ", error);
    return null;
  }
}

/**
 * Joins an existing challenge session by room code.
 */
export async function joinChallengeSession(
  roomCode: string, 
  userId: string, 
  userName: string
): Promise<ChallengeSession | null> {
  try {
    const sessionRef = collection(db, "sessions");
    const q = query(sessionRef, where("roomCode", "==", roomCode.toUpperCase()), where("status", "==", "waiting"));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      throw new Error("Room not found or already started.");
    }
    
    const sessionDoc = snap.docs[0];
    const session = { id: sessionDoc.id, ...sessionDoc.data() } as ChallengeSession;
    
    const participant: Participant = {
      uid: userId,
      name: userName,
      isHost: false,
      joinedAt: Timestamp.now(),
      status: 'answering'
    };
    
    await updateDoc(doc(db, "sessions", session.id), {
      [`participants.${userId}`]: participant
    });
    
    return { ...session, participants: { ...session.participants, [userId]: participant } };
  } catch (error) {
    console.error("[Firebase] Error joining session: ", error);
    throw error;
  }
}

/**
 * Real-time listener for challenge session updates.
 */
export function onChallengeSessionUpdate(sessionId: string, callback: (session: ChallengeSession) => void) {
  const sessionRef = doc(db, "sessions", sessionId);
  return onSnapshot(sessionRef, (doc) => {
    if (doc.exists()) {
      callback({ id: doc.id, ...doc.data() } as ChallengeSession);
    }
  });
}

export async function updateSession(sessionId: string, updates: Partial<ChallengeSession>) {
  const sessionRef = doc(db, "sessions", sessionId);
  await updateDoc(sessionRef, updates);
}

export async function submitParticipantResults(
  sessionId: string, 
  userId: string, 
  results: Participant["results"]
) {
  const sessionRef = doc(db, "sessions", sessionId);
  await updateDoc(sessionRef, {
    [`participants.${userId}.results`]: results,
    [`participants.${userId}.status`]: 'finished'
  });
}

// ── Summary feature persistence (user-scoped) ────────────────────────────────

export async function saveSummaryRecord(
  record: Omit<SummaryRecord, "id" | "createdAt">
): Promise<string> {
  assertFirebaseConfigured();
  const ref = collection(db, "users", getUserId(), "summaries");
  const docRef = await addDoc(ref, {
    ...record,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function listSummariesForDocument(documentId: string): Promise<SummaryRecord[]> {
  assertFirebaseConfigured();
  try {
    const ref = collection(db, "users", getUserId(), "summaries");
    const q = query(ref, where("documentId", "==", documentId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SummaryRecord));
  } catch (error) {
    console.warn("[Firebase] listSummariesForDocument fallback:", error);
    const ref = collection(db, "users", getUserId(), "summaries");
    const snap = await getDocs(ref);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SummaryRecord))
      .filter((s) => s.documentId === documentId)
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
  }
}

export async function getSummaryById(summaryId: string): Promise<SummaryRecord | null> {
  assertFirebaseConfigured();
  const snap = await getDoc(doc(db, "users", getUserId(), "summaries", summaryId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SummaryRecord;
}

export async function listAllSummaries(): Promise<SummaryRecord[]> {
  assertFirebaseConfigured();
  try {
    const ref = collection(db, "users", getUserId(), "summaries");
    const q = query(ref, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SummaryRecord));
  } catch {
    return [];
  }
}

export async function saveChatSession(
  documentId: string,
  messages: ChatSession["messages"],
  existingId?: string
): Promise<string> {
  assertFirebaseConfigured();
  const payload = {
    documentId,
    messages,
    updatedAt: Timestamp.now(),
  };
  if (existingId) {
    await setDoc(doc(db, "users", getUserId(), "chats", existingId), payload, { merge: true });
    return existingId;
  }
  const docRef = await addDoc(collection(db, "users", getUserId(), "chats"), payload);
  return docRef.id;
}

export async function getChatForDocument(documentId: string): Promise<ChatSession | null> {
  assertFirebaseConfigured();
  try {
    const ref = collection(db, "users", getUserId(), "chats");
    const q = query(ref, where("documentId", "==", documentId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as ChatSession;
  } catch {
    return null;
  }
}

export async function clearChatForDocument(documentId: string): Promise<void> {
  const existing = await getChatForDocument(documentId);
  if (existing?.id) {
    await deleteDoc(doc(db, "users", getUserId(), "chats", existing.id));
  }
}

export async function saveFlashcardDeck(
  deck: Omit<FlashcardDeck, "id" | "createdAt">
): Promise<string> {
  assertFirebaseConfigured();
  const docRef = await addDoc(collection(db, "users", getUserId(), "flashcardDecks"), {
    ...deck,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function listFlashcardDecks(documentId: string): Promise<FlashcardDeck[]> {
  assertFirebaseConfigured();
  try {
    const ref = collection(db, "users", getUserId(), "flashcardDecks");
    const q = query(ref, where("documentId", "==", documentId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FlashcardDeck));
  } catch {
    const snap = await getDocs(collection(db, "users", getUserId(), "flashcardDecks"));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as FlashcardDeck))
      .filter((d) => d.documentId === documentId);
  }
}

export async function updateFlashcardDeck(deckId: string, cards: FlashcardDeck["cards"]): Promise<void> {
  assertFirebaseConfigured();
  await updateDoc(doc(db, "users", getUserId(), "flashcardDecks", deckId), { cards });
}

export async function saveMistake(entry: Omit<MistakeEntry, "id" | "dateAttempted">): Promise<string> {
  assertFirebaseConfigured();
  const docRef = await addDoc(collection(db, "users", getUserId(), "mistakes"), {
    ...entry,
    dateAttempted: Timestamp.now(),
  });
  return docRef.id;
}

export async function listMistakes(): Promise<MistakeEntry[]> {
  assertFirebaseConfigured();
  try {
    const q = query(collection(db, "users", getUserId(), "mistakes"), orderBy("dateAttempted", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MistakeEntry));
  } catch {
    return [];
  }
}

export async function updateMistake(
  mistakeId: string,
  updates: Partial<MistakeEntry>
): Promise<void> {
  assertFirebaseConfigured();
  await updateDoc(doc(db, "users", getUserId(), "mistakes", mistakeId), updates);
}

export async function saveRevisionTask(
  task: Omit<RevisionTask, "id" | "createdAt">
): Promise<string> {
  assertFirebaseConfigured();
  // Firestore rejects `undefined` field values — drop them before write
  const cleaned: Record<string, unknown> = { createdAt: Timestamp.now() };
  for (const [key, value] of Object.entries(task)) {
    if (value !== undefined) cleaned[key] = value;
  }
  const docRef = await addDoc(collection(db, "users", getUserId(), "revisionTasks"), cleaned);
  return docRef.id;
}

/** Update fields the student edits on a planned task (e.g. its estimated duration). */
export async function updateRevisionTask(
  taskId: string,
  updates: Partial<Pick<RevisionTask, "durationMinutes" | "date" | "studyFocus">>
): Promise<void> {
  assertFirebaseConfigured();
  await updateDoc(doc(db, "users", getUserId(), "revisionTasks", taskId), updates);
}

export async function listRevisionTasks(): Promise<RevisionTask[]> {
  assertFirebaseConfigured();
  try {
    const q = query(collection(db, "users", getUserId(), "revisionTasks"), orderBy("date", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RevisionTask));
  } catch {
    return [];
  }
}

