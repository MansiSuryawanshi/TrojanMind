/**
 * Import of user-selected course materials.
 *
 * Selections arrive as topic keys only. Every key is resolved here against a
 * fresh content tree for the course, so titles, links, and source types come
 * from Brightspace, never from the request. Only the selected items are
 * touched, only through the connector's documented tools:
 *  - Brightspace file topics           → download_file { courseId, topicId }   (inline text)
 *  - course files linked in a module   → download_file { courseId, coursePath } (inline text)
 *  - Brightspace HTML pages            → the topic's own body from get_course_content,
 *                                        plus any Google Docs embedded or linked in it
 *  - Google Docs / Sheets / Slides     → plain-text export from docs.google.com
 *                                        (link-shared or published docs only; see googleDocs.ts)
 *  - Google Drive files and folders    → download / public folder listing (see googleDrive.ts)
 * Everything else (Forms, recordings/LTI, external
 * sites) is kept as a reference only: those URLs are never fetched or crawled.
 */
import {
  downloadCourseFileText,
  downloadTopicText,
  htmlToText,
  type ContentModule,
  type ContentTopic,
  type CourseContent,
  type FileTextResult,
  type RetrievalFailure,
  type SourceType,
} from './brightspaceMcp.ts';
import { fetchDriveFileText, fetchDriveFolderText, parseDriveFileId, parseDriveFolderId } from './googleDrive.ts';
import { fetchGoogleDocText, googleDocsInHtml, parseGoogleDocUrl, type GoogleDocRef, type GoogleFailure } from './googleDocs.ts';

/** Most items accepted in one import request. */
export const MAX_IMPORT_ITEMS = 25;
/** Longest key accepted (course-file keys carry a path). */
export const MAX_KEY_LENGTH = 1100;

export type ItemStatus = 'imported' | 'link_only' | 'failed';

/**
 * Why an item has no text:
 *  - RetrievalFailure codes from download_file
 *  - 'reference_only'   : a source type TrojanMind deliberately doesn't fetch
 *  - 'not_available'    : hidden, locked, or not yet available in Brightspace
 *  - 'not_in_course'    : the key isn't in the course's current content
 *  - 'no_page_body'     : Brightspace page with no body the connector returns
 *  - GoogleFailure codes from the Google Docs export
 */
export type ItemReason = RetrievalFailure | GoogleFailure | 'reference_only' | 'not_available' | 'not_in_course' | 'no_page_body';

export interface ImportItemResult {
  index: number;
  key: string;
  topicId: number | null;
  title: string;
  moduleTitle: string;
  sourceType: SourceType;
  url: string | null;
  status: ItemStatus;
  reason: ItemReason | null;
  /** How the text was obtained, when it was. */
  method: 'download_file' | 'page_body' | 'google_export' | null;
  text: string | null;
  truncated: boolean;
  pages: number | null;
}

interface Located {
  topic: ContentTopic;
  moduleTitle: string;
}

/** Every topic in the tree by key, with its nearest module title. */
export function indexTopics(content: CourseContent): Map<string, Located> {
  const map = new Map<string, Located>();
  for (const t of content.looseTopics) map.set(t.key, { topic: t, moduleTitle: 'Course content' });
  const walk = (m: ContentModule) => {
    for (const c of m.children) {
      if (c.kind === 'topic') map.set(c.key, { topic: c, moduleTitle: m.title });
      else walk(c);
    }
  };
  content.modules.forEach(walk);
  return map;
}

/** Validate the request body's keys: strings, de-duplicated, bounded. */
export function parseImportKeys(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null;
  const keys = (body as Record<string, unknown>).keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_IMPORT_ITEMS) return null;
  const out: string[] = [];
  for (const k of keys) {
    if (typeof k !== 'string' || !k || k.length > MAX_KEY_LENGTH) return null;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/** The course-file path inside a module-description key ("coursefile:<moduleId>:<path>"). */
function courseFilePath(key: string): string | null {
  const m = /^coursefile:\d+:(.+)$/s.exec(key);
  return m ? m[1] : null;
}

/** What to call for one resolved topic, or why nothing will be called. */
type Plan =
  | { kind: 'topic_file'; topicId: number }
  | { kind: 'course_file'; coursePath: string }
  | { kind: 'page_body'; html: string }
  | { kind: 'google_doc'; ref: GoogleDocRef }
  | { kind: 'drive_file'; id: string }
  | { kind: 'drive_folder'; id: string }
  | { kind: 'skip'; status: ItemStatus; reason: ItemReason };

export function planFor(loc: Located, inlineHtml: Map<number, string>): Plan {
  const t = loc.topic;
  if (t.isHidden || t.isLocked || !t.isAvailable) return { kind: 'skip', status: 'link_only', reason: 'not_available' };

  switch (t.sourceType) {
    case 'brightspace_file': {
      if (t.origin === 'module_description') {
        const path = courseFilePath(t.key);
        return path ? { kind: 'course_file', coursePath: path } : { kind: 'skip', status: 'failed', reason: 'not_found' };
      }
      if (t.topicType === 'file' && t.id !== null) return { kind: 'topic_file', topicId: t.id };
      // A link topic that points into the course file store (quickLink coursefile or /content/enforced/).
      if (t.topicType === 'link' && t.sourceUrl) return { kind: 'course_file', coursePath: t.sourceUrl };
      return { kind: 'skip', status: 'link_only', reason: 'reference_only' };
    }
    case 'brightspace_page': {
      const html = t.id !== null ? inlineHtml.get(t.id) : undefined;
      return html ? { kind: 'page_body', html } : { kind: 'skip', status: 'link_only', reason: 'no_page_body' };
    }
    case 'google_doc': {
      const ref = parseGoogleDocUrl(t.url);
      return ref ? { kind: 'google_doc', ref } : { kind: 'skip', status: 'link_only', reason: 'reference_only' };
    }
    case 'google_drive_file': {
      const id = parseDriveFileId(t.url);
      return id ? { kind: 'drive_file', id } : { kind: 'skip', status: 'link_only', reason: 'reference_only' };
    }
    case 'google_drive_folder': {
      const id = parseDriveFolderId(t.url);
      return id ? { kind: 'drive_folder', id } : { kind: 'skip', status: 'link_only', reason: 'reference_only' };
    }
    default:
      // Google Forms, recordings & LTI, external sites, no link.
      return { kind: 'skip', status: 'link_only', reason: 'reference_only' };
  }
}

function base(index: number, key: string, loc: Located | undefined): Omit<ImportItemResult, 'status' | 'reason' | 'method' | 'text' | 'truncated' | 'pages'> {
  return {
    index,
    key,
    topicId: loc?.topic.id ?? null,
    title: loc?.topic.title ?? 'Unknown item',
    moduleTitle: loc?.moduleTitle ?? '',
    sourceType: loc?.topic.sourceType ?? 'unavailable',
    url: loc?.topic.url ?? null,
  };
}

/** Longest text kept per item: the connector's own inline cap. */
const MAX_ITEM_CHARS = 400_000;

/**
 * Retrieve one selected item. Throws only for failures that should stop the
 * whole import (sign-in, connector down); per-item problems come back as a
 * `failed` / `link_only` result.
 */
export async function importOne(
  courseId: number,
  index: number,
  key: string,
  topics: Map<string, Located>,
  inlineHtml: Map<number, string>,
): Promise<ImportItemResult> {
  const loc = topics.get(key);
  const b = base(index, key, loc);
  const none = { method: null, text: null, truncated: false, pages: null } as const;
  if (!loc) return { ...b, status: 'failed', reason: 'not_in_course', ...none };

  const plan = planFor(loc, inlineHtml);
  if (plan.kind === 'skip') return { ...b, status: plan.status, reason: plan.reason, ...none };

  if (plan.kind === 'google_doc') {
    const res = await fetchGoogleDocText(plan.ref);
    if (!res.ok) return { ...b, status: 'failed', reason: res.reason, ...none };
    const truncated = res.truncated || res.text.length > MAX_ITEM_CHARS;
    return { ...b, status: 'imported', reason: null, method: 'google_export', text: truncated ? res.text.slice(0, MAX_ITEM_CHARS) : res.text, truncated, pages: null };
  }

  if (plan.kind === 'drive_file' || plan.kind === 'drive_folder') {
    const res = plan.kind === 'drive_file' ? await fetchDriveFileText(plan.id) : await fetchDriveFolderText(plan.id, MAX_ITEM_CHARS);
    if (!res.ok) return { ...b, status: 'failed', reason: res.reason, ...none };
    const truncated = res.truncated || res.text.length > MAX_ITEM_CHARS;
    return { ...b, status: 'imported', reason: null, method: 'google_export', text: truncated ? res.text.slice(0, MAX_ITEM_CHARS) : res.text, truncated, pages: null };
  }

  if (plan.kind === 'page_body') {
    let text = htmlToText(plan.html);
    // Google Docs embedded (iframe) or linked in the page: append their text.
    for (const ref of googleDocsInHtml(plan.html)) {
      const doc = await fetchGoogleDocText(ref);
      if (doc.ok) text += `

--- Embedded Google ${ref.kind === 'document' ? 'Doc' : ref.kind === 'spreadsheets' ? 'Sheet' : 'Slides'} ---
${doc.text}`;
    }
    text = text.trim();
    if (!text) return { ...b, status: 'failed', reason: 'empty', ...none };
    const truncated = text.length > MAX_ITEM_CHARS;
    return { ...b, status: 'imported', reason: null, method: 'page_body', text: truncated ? text.slice(0, MAX_ITEM_CHARS) : text, truncated, pages: null };
  }

  const res: FileTextResult = plan.kind === 'topic_file'
    ? await downloadTopicText(courseId, plan.topicId)
    : await downloadCourseFileText(courseId, plan.coursePath);
  if (!res.ok) return { ...b, status: 'failed', reason: res.reason, ...none };
  const truncated = res.truncated || res.text.length > MAX_ITEM_CHARS;
  return {
    ...b,
    status: 'imported',
    reason: null,
    method: 'download_file',
    text: res.text.length > MAX_ITEM_CHARS ? res.text.slice(0, MAX_ITEM_CHARS) : res.text,
    truncated,
    pages: res.pages,
  };
}
