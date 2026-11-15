import type { ContentModule, ContentTopic, CourseContent, SourceType } from './brightspaceContext';

/** Proxied by the Vite dev server to the localhost-only connector (server/index.ts). */
export const courseContentEndpoint = (courseId: number) => `/local-api/brightspace/courses/${courseId}/content`;

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
