import type { ContentModule, ContentTopic, CourseContent, ImportEvent, SourceType } from './brightspaceContext';

/** Proxied by the Vite dev server to the localhost-only connector (server/index.ts). */
export const courseContentEndpoint = (courseId: number) => `/local-api/brightspace/courses/${courseId}/content`;
export const courseImportEndpoint = (courseId: number) => `/local-api/brightspace/courses/${courseId}/import`;

/** Validate one NDJSON import event. Only server-authored fields are kept. */
export function toImportEvent(v: unknown): ImportEvent | null {
  if (!v || typeof v !== 'object') return null;
  const e = v as Record<string, unknown>;
  if (e.type === 'start') {
    const c = e.course as Record<string, unknown> | undefined;
    if (!c || typeof c.id !== 'number' || typeof c.name !== 'string') return null;
    return { type: 'start', course: { id: c.id, name: c.name, code: strOrNull(c.code) }, total: typeof e.total === 'number' ? e.total : 0 };
  }
  if (e.type === 'done') return { type: 'done' };
  if (e.type === 'error') {
    return { type: 'error', code: typeof e.code === 'string' ? e.code : 'import_failed', message: typeof e.message === 'string' ? e.message : 'The import stopped.' };
  }
  if (e.type !== 'item' || !e.item || typeof e.item !== 'object') return null;
  const i = e.item as Record<string, unknown>;
  if (typeof i.index !== 'number' || typeof i.key !== 'string' || typeof i.title !== 'string') return null;
  const status = i.status === 'imported' || i.status === 'link_only' ? i.status : 'failed';
  const url = safeHttpUrl(i.url);
  const declared = SOURCE_TYPES.has(i.sourceType as SourceType) ? (i.sourceType as SourceType) : 'unavailable';
  const text = status === 'imported' && typeof i.text === 'string' && i.text.trim() ? i.text : null;
  return {
    type: 'item',
    item: {
      index: i.index,
      key: i.key,
      topicId: typeof i.topicId === 'number' ? i.topicId : null,
      title: i.title,
      moduleTitle: typeof i.moduleTitle === 'string' ? i.moduleTitle : '',
      sourceType: declared,
      url,
      // "imported" with no text is not an import.
      status: status === 'imported' && !text ? 'failed' : status,
      reason: status === 'imported' && !text ? 'empty' : strOrNull(i.reason),
      method: i.method === 'download_file' || i.method === 'page_body' ? i.method : null,
      text,
      truncated: i.truncated === true,
      pages: typeof i.pages === 'number' ? i.pages : null,
    },
  };
}

/** What each "no text" reason means, in TrojanMind's words. */
export const IMPORT_REASON_TEXT: Record<string, string> = {
  reference_only: 'Saved as a link only. TrojanMind doesn’t retrieve this kind of source.',
  not_available: 'Hidden, locked, or not yet available in Brightspace, so it wasn’t requested.',
  not_in_course: 'No longer in this course’s content, so it wasn’t requested.',
  no_page_body: 'Brightspace didn’t provide a readable body for this page.',
  no_text_layer: 'This PDF has no text layer (it may be a scan), so there’s no text to import.',
  no_office_text: 'No readable text was found in this Office file.',
  image_only: 'This is an image file; there’s no text to import.',
  unsupported_type: 'This file type can’t be read as text by the connector.',
  too_large: 'The file is over the connector’s 10 MB limit for text retrieval.',
  not_released: 'Brightspace says this file isn’t released to you right now.',
  not_found: 'Brightspace couldn’t find this file, or this account can’t open it.',
  access_denied: 'Brightspace refused access to this file for this account.',
  rate_limited: 'Brightspace was rate-limiting requests. Try importing it again later.',
  unreachable: 'Couldn’t reach Brightspace for this item.',
  empty: 'The file came back with no text.',
  interrupted: 'Not retrieved: the import was interrupted before this item.',
  save_failed: 'Retrieved, but saving it to your history failed. Import it again.',
  unknown: 'Brightspace couldn’t return this file’s text.',
};

/** What remains unavailable for a link-only source type. */
export const LINK_ONLY_NOTE: Partial<Record<SourceType, string>> = {
  google_drive_folder: 'Google Drive folders aren’t opened or listed. Open the folder and upload or paste the documents you need.',
  google_drive_file: 'Google Drive files aren’t downloaded. Open it, then upload or paste its text.',
  google_doc: 'Google Docs / Sheets / Slides aren’t retrieved. Open it, then upload or paste its text.',
  recording_lti: 'Recordings and LTI tools aren’t transcribed here. Open it in Brightspace, or paste notes or a transcript.',
  external_link: 'External websites aren’t fetched. Open it, then paste the relevant text.',
  brightspace_page: 'This Brightspace link has no readable body. Open it, then paste the relevant text.',
  unavailable: 'Brightspace provided no openable link for this item.',
};

const SOURCE_TYPES = new Set<SourceType>([
  'brightspace_file', 'brightspace_page', 'google_drive_folder', 'google_drive_file',
  'google_doc', 'recording_lti', 'external_link', 'unavailable',
]);

const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Only absolute http(s) links without embedded credentials are ever rendered as hrefs. */
export function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

function toTopic(r: Record<string, unknown>): ContentTopic | null {
  if (typeof r.key !== 'string' || typeof r.title !== 'string') return null;
  const url = safeHttpUrl(r.url);
  const declared = SOURCE_TYPES.has(r.sourceType as SourceType) ? (r.sourceType as SourceType) : 'unavailable';
  return {
    kind: 'topic',
    key: r.key,
    id: typeof r.id === 'number' ? r.id : null,
    title: r.title,
    topicType: r.topicType === 'file' || r.topicType === 'link' ? r.topicType : 'other',
    sourceType: url ? declared : 'unavailable',
    description: strOrNull(r.description),
    hasInlineContent: r.hasInlineContent === true,
    url,
    sourceUrl: strOrNull(r.sourceUrl),
    lastModified: strOrNull(r.lastModified),
    isHidden: r.isHidden === true,
    isLocked: r.isLocked === true,
    isAvailable: r.isAvailable !== false,
    availabilityMessage: strOrNull(r.availabilityMessage),
    isCompleted: typeof r.isCompleted === 'boolean' ? r.isCompleted : null,
    origin: r.origin === 'module_description' ? 'module_description' : 'topic',
  };
}

function toNode(v: unknown): ContentModule | ContentTopic | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (r.kind === 'topic') return toTopic(r);
  if (r.kind !== 'module' || typeof r.id !== 'number' || typeof r.title !== 'string') return null;
  return {
    kind: 'module',
    id: r.id,
    title: r.title,
    description: strOrNull(r.description),
    lastModified: strOrNull(r.lastModified),
    isHidden: r.isHidden === true,
    isLocked: r.isLocked === true,
    isAvailable: r.isAvailable !== false,
    availabilityMessage: strOrNull(r.availabilityMessage),
    childrenUnavailable: strOrNull(r.childrenUnavailable),
    children: Array.isArray(r.children) ? r.children.map(toNode).filter((n): n is ContentModule | ContentTopic => n !== null) : [],
  };
}

/** Validate the connector's course-content response; null if it isn't what we expect. */
export function toCourseContent(body: unknown, courseId: number): CourseContent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const course = b.course as Record<string, unknown> | undefined;
  if (!course || course.id !== courseId || typeof course.name !== 'string' || !Array.isArray(b.modules)) return null;
  return {
    course: { id: courseId, name: course.name, code: strOrNull(course.code) },
    modules: b.modules.map(toNode).filter((n): n is ContentModule => n?.kind === 'module'),
    looseTopics: Array.isArray(b.looseTopics) ? b.looseTopics.map(toNode).filter((n): n is ContentTopic => n?.kind === 'topic') : [],
    topicCount: typeof b.topicCount === 'number' ? b.topicCount : 0,
    moduleCount: typeof b.moduleCount === 'number' ? b.moduleCount : 0,
    notices: Array.isArray(b.notices) ? b.notices.filter((n): n is string => typeof n === 'string') : [],
    retrievedAt: typeof b.retrievedAt === 'string' ? b.retrievedAt : new Date().toISOString(),
  };
}

/** Every topic under a module, depth-first, in Brightspace order. */
export function topicsIn(node: ContentModule): ContentTopic[] {
  const out: ContentTopic[] = [];
  for (const c of node.children) {
    if (c.kind === 'topic') out.push(c);
    else out.push(...topicsIn(c));
  }
  return out;
}

export const SOURCE_TYPE_INFO: Record<SourceType, { label: string; note: string }> = {
  brightspace_file: { label: 'Brightspace file', note: 'A file hosted in Brightspace. Not downloaded.' },
  brightspace_page: { label: 'Brightspace page', note: 'A page inside Brightspace. Its content was not retrieved.' },
  google_drive_folder: { label: 'Google Drive folder', note: 'A folder link, not an individual document. The files inside were not listed or retrieved.' },
  google_drive_file: { label: 'Google Drive file', note: 'A single file stored in Google Drive. Not downloaded.' },
  google_doc: { label: 'Google Doc', note: 'A Google Docs / Sheets / Slides link. Its content was not retrieved.' },
  recording_lti: { label: 'Recording / LTI link', note: 'A lecture recording or external tool launch. No transcript was retrieved.' },
  external_link: { label: 'External link', note: 'A link to another website. Its content was not retrieved.' },
  unavailable: { label: 'No openable link', note: 'Brightspace provided no safe http(s) link for this item.' },
};
