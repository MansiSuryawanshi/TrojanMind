/**
 * Talks to the locally installed, already-configured brightspace-mcp-server
 * over stdio using the official MCP TypeScript SDK. The child process, its
 * stored Brightspace session, and any credentials stay on this machine; only
 * parsed course fields and TrojanMind-authored status text leave this module.
 *
 * Connector text is written for an AI model and is never forwarded verbatim:
 * it is classified against the connector's fixed message set and replaced
 * with our own wording. The only value carried over is the MFA match number,
 * which the connector itself restricts to 1–3 digits.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BRIGHTSPACE_BASE_URL, mcpLaunch } from './config.ts';

export interface BrightspaceCourse {
  id: number;
  name: string;
  code: string | null;
  role: string | null;
  isActive: boolean | null;
  canAccess: boolean | null;
  startDate: string | null;
  endDate: string | null;
}

/** Non-connected sign-in states the UI can show. */
export type AuthState = 'action_required' | 'pending' | 'failed' | 'config';

export type SignInOutcome = { state: 'connected' } | { state: AuthState; message: string };

/** A failure we can describe to the user without leaking internals. */
export class ConnectorError extends Error {
  readonly kind: 'launch' | 'auth' | 'parse' | 'timeout' | 'tool';
  readonly authState: AuthState | null;
  constructor(kind: ConnectorError['kind'], message: string, authState: AuthState | null = null) {
    super(message);
    this.kind = kind;
    this.authState = authState;
  }
}

// sign_in waits up to ~45 s per call for an MFA approval; leave headroom.
const CALL_TIMEOUT_MS = 180_000;
// Always pin USC when re-authing from a terminal (MCP package defaults to Purdue).
const AUTH_COMMAND =
  'set D2L_BASE_URL=https://brightspace.usc.edu&& npx -y brightspace-mcp-server@latest auth';

let clientPromise: Promise<Client> | null = null;

function connect(): Promise<Client> {
  if (clientPromise) return clientPromise;
  const { command, args } = mcpLaunch();
  // brightspace-mcp-server defaults to Purdue if D2L_BASE_URL is unset.
  // Force USC Brightspace unless BRIGHTSPACE_BASE_URL overrides it.
  const schoolOrigin = BRIGHTSPACE_BASE_URL || 'https://brightspace.usc.edu';
  const transport = new StdioClientTransport({
    command,
    args,
    // SDK's safe default env (PATH, USERPROFILE, APPDATA, ...) so the server can
    // reach its own keychain entry and encrypted session. We add nothing secret
    // and change no sign-in / MFA preferences — only the school URL.
    env: {
      ...getDefaultEnvironment(),
      D2L_NO_UPDATE_CHECK: '1',
      D2L_BASE_URL: schoolOrigin,
    },
    // The child's logs could mention sign-in details; don't surface them.
    stderr: 'ignore',
  });
  const client = new Client({ name: 'trojanmind-local-connector', version: '0.2.0' });
  const reset = () => {
    clientPromise = null;
  };
  transport.onclose = reset;
  transport.onerror = reset;

  clientPromise = client.connect(transport).then(
    () => client,
    () => {
      reset();
      console.error('[mcp] failed to start brightspace-mcp-server');
      throw new ConnectorError('launch', 'Could not start the local Brightspace connector (brightspace-mcp-server).');
    },
  );
  return clientPromise;
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const client = await connect();
  try {
    return await client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/timed? ?out/i.test(msg)) {
      throw new ConnectorError('timeout', 'Brightspace took too long to respond. Click “Check again” to keep waiting.', 'pending');
    }
    console.error(`[mcp] ${name} call failed`);
    throw new ConnectorError('launch', 'The local Brightspace connector stopped responding.');
  }
}

function textBlocks(result: unknown): string[] {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((b): b is { type: 'text'; text: string } => !!b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text);
}

const isErrorResult = (result: unknown) => (result as { isError?: unknown })?.isError === true;

/**
 * Map connector auth text (from sign_in, or a tool blocked on sign-in) onto a
 * TrojanMind-authored status. Patterns follow brightspace-mcp-server 5.2.x
 * (tools/sign-in.js, tools/tool-helpers.js). Unknown text never passes through.
 */
export function classifyAuthText(text: string): SignInOutcome {
  const t = text.trim();
  const has = (s: string) => t.includes(s);

  if (t.startsWith('Already signed in to Brightspace') || t.startsWith('Signed in to Brightspace.')) {
    return { state: 'connected' };
  }

  // Needs the person at this computer.
  const num = /Open Microsoft Authenticator and enter (\d{1,3}) within/.exec(t);
  if (num) {
    return { state: 'action_required', message: `Open Microsoft Authenticator and enter ${num[1]} within 5 minutes, then click “Check again”.` };
  }
  if (has('Approve the sign-in request on your phone')) {
    return { state: 'action_required', message: 'Approve the Brightspace sign-in request on your phone (Duo or Microsoft Authenticator), then click “Check again”.' };
  }
  if (has('browser window is opening')) {
    return { state: 'action_required', message: 'A Brightspace sign-in window opened on this computer. Finish signing in there, then click “Check again”.' };
  }
  if (has('still holding an earlier sign-in prompt')) {
    return { state: 'action_required', message: 'An earlier sign-in prompt is still open, so a new one can’t be sent yet. Wait a few minutes, then click “Check again”. Deny any prompt you didn’t start.' };
  }
  if (has('Automatic sign-in is paused')) {
    return { state: 'action_required', message: `Automatic sign-in is paused for about 5 minutes after a missed prompt. Wait, then click “Check again”, or run \`${AUTH_COMMAND}\` in a terminal.` };
  }
  if (has('needs something your AI client cannot supply') || has('did not finish in time') || has('did not complete') || has('Authentication expired')) {
    return { state: 'action_required', message: `Brightspace sign-in needs to be finished in a terminal. Run \`${AUTH_COMMAND}\` from your home folder, then click “Check again”.` };
  }

  // Still working on its own: nothing for the user to do yet.
  if (has('still starting in the background') || has('answering its own verification code') || has('already in progress') || has('a sign-in was already running')) {
    return { state: 'pending', message: 'Brightspace sign-in is still in progress on this computer. Click “Check again” in a moment.' };
  }

  // Transient failures.
  if (has('could not be reached') || has('got stuck') || has('already running in another process') || has('was cancelled') || has('could not renew your session')) {
    return { state: 'failed', message: 'Brightspace sign-in didn’t finish this time. Your saved session was kept. Try again in a moment.' };
  }

  // Local setup problems.
  if (has('credential store is locked')) {
    return { state: 'config', message: 'Windows Credential Manager is locked or unavailable, so the saved Brightspace sign-in can’t be used. Unlock it and try again.' };
  }
  if (has('Chromium is missing') || has("Playwright's package code is missing")) {
    return { state: 'config', message: 'The local Brightspace connector’s sign-in browser is missing. Run `npx -y brightspace-mcp-server@latest doctor` on this computer to see how to repair it.' };
  }
  if (has('No password is saved on this computer') || has('cannot start a sign-in itself') || has('authenticates with a credential from its configuration')) {
    return { state: 'config', message: 'The local Brightspace connector isn’t set up to sign in automatically. Run `npx -y brightspace-mcp-server@latest setup` on this computer.' };
  }

  return { state: 'action_required', message: `Brightspace sign-in needs attention. Run \`${AUTH_COMMAND}\` in a terminal, then click “Check again”.` };
}

function authErrorFrom(text: string | undefined): ConnectorError {
  const o = text ? classifyAuthText(text) : null;
  if (o && o.state !== 'connected') return new ConnectorError('auth', o.message, o.state);
  return new ConnectorError('tool', 'Brightspace returned an error.');
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** Validate get_my_courses JSON and keep only the fields TrojanMind displays. */
export function parseCourses(result: unknown): BrightspaceCourse[] {
  const blocks = textBlocks(result);
  if (isErrorResult(result)) throw toolErrorFrom(blocks[0]);
  if (blocks.length === 0) throw new ConnectorError('parse', 'Brightspace returned an empty response.');

  let data: unknown;
  try {
    data = JSON.parse(blocks[0]);
  } catch {
    // Not JSON: a sign-in notice in place of data.
    throw authErrorFrom(blocks[0]);
  }
  if (!Array.isArray(data)) throw new ConnectorError('parse', 'Unexpected course data format from Brightspace.');

  const courses: BrightspaceCourse[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'number' ? r.id : typeof r.id === 'string' && /^\d+$/.test(r.id) ? Number(r.id) : NaN;
    const name = str(r.name);
    if (!Number.isFinite(id) || !name) continue; // skip malformed rows rather than invent data
    courses.push({
      id,
      name,
      code: str(r.code),
      role: str(r.role),
      isActive: bool(r.isActive),
      canAccess: bool(r.canAccess),
      startDate: str(r.startDate),
      endDate: str(r.endDate),
    });
  }
  return courses;
}

export async function getMyCourses(): Promise<BrightspaceCourse[]> {
  return parseCourses(await call('get_my_courses'));
}

/**
 * The supported sign_in tool: a no-op when the saved session is valid, so
 * calling it after every login never forces re-authentication. `visible` is
 * left to the connector's own default.
 */
export async function signIn(): Promise<SignInOutcome> {
  const result = await call('sign_in');
  const text = textBlocks(result)[0];
  if (!text) return { state: 'failed', message: 'Brightspace sign-in returned no status. Try again.' };
  return classifyAuthText(text);
}

interface LocalServerInfo {
  uniqueName: string | null;
  /** The connector's configured school URL (origin only), or null. */
  schoolOrigin: string | null;
}

async function getLocalServerInfo(): Promise<LocalServerInfo> {
  const result = await call('get_server_info');
  if (isErrorResult(result)) throw new ConnectorError('tool', 'Could not read the Brightspace connection status.');
  const text = textBlocks(result)[0];
  let info: { signedInAs?: { uniqueName?: unknown }; schoolUrl?: unknown };
  try {
    info = JSON.parse(text ?? '');
  } catch {
    throw new ConnectorError('parse', 'Unexpected status format from the Brightspace connector.');
  }
  return {
    uniqueName: str(info?.signedInAs?.uniqueName)?.trim() ?? null,
    schoolOrigin: httpOrigin(str(info?.schoolUrl)),
  };
}

/**
 * The Brightspace uniqueName of the session saved on this computer, read
 * locally by get_server_info (no network, never triggers sign-in). Null when
 * no signed-in identity is recorded.
 */
export async function getSignedInUniqueName(): Promise<string | null> {
  return (await getLocalServerInfo()).uniqueName;
}

/**
 * Base URL for resolving relative Brightspace links: BRIGHTSPACE_BASE_URL if
 * set, else the school URL the connector itself is configured with.
 */
export async function getBrightspaceOrigin(): Promise<string | null> {
  return httpOrigin(BRIGHTSPACE_BASE_URL ?? null) ?? (await getLocalServerInfo()).schoolOrigin;
}

// ── Course content ──────────────────────────────────────────────────────────

/**
 * Where a selected item actually lives. Nothing here implies TrojanMind has
 * fetched it: these are references to sources.
 */
export type SourceType =
  | 'brightspace_file'    // file stored in Brightspace (topic file or course file)
  | 'brightspace_page'    // other page inside Brightspace (HTML topic, internal link)
  | 'google_drive_folder' // a folder: not an individual document
  | 'google_drive_file'   // a single file stored in Google Drive
  | 'google_doc'          // Google Docs / Sheets / Slides / Forms
  | 'recording_lti'       // lecture recording, embedded media, or LTI tool launch: not a transcript
  | 'external_link'       // any other web link
  | 'unavailable';        // no safe link was provided

export interface ContentTopic {
  kind: 'topic';
  /** Brightspace topic ID, or "coursefile:<path>" for files linked from a module description. */
  key: string;
  id: number | null;
  title: string;
  /** Brightspace's own topic type as reported by the connector. */
  topicType: 'file' | 'link' | 'other';
  sourceType: SourceType;
  description: string | null;
  /** True when the topic has its own HTML body in Brightspace. */
  hasInlineContent: boolean;
  /** Absolute http(s) URL safe to open, or null. */
  url: string | null;
  /** The link exactly as Brightspace returned it (may be relative), for display. */
  sourceUrl: string | null;
  lastModified: string | null;
  isHidden: boolean;
  isLocked: boolean;
  isAvailable: boolean;
  availabilityMessage: string | null;
  isCompleted: boolean | null;
  /** 'topic' = a real content topic; 'module_description' = a course file linked from a module's description. */
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
  /** Set when Brightspace wouldn't return this module's contents (children is then empty but NOT known to be empty). */
  childrenUnavailable: string | null;
  children: (ContentModule | ContentTopic)[];
}

export interface CourseContent {
  modules: ContentModule[];
  /** Top-level topics that sit outside any module (rare, kept in order). */
  looseTopics: ContentTopic[];
  topicCount: number;
  moduleCount: number;
  notices: string[];
}

/** Origin of an http(s) URL with no credentials, else null. */
function httpOrigin(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve a Brightspace-provided link to an absolute URL that is safe to open:
 * relative links resolve against the Brightspace origin; only http(s) without
 * embedded credentials is accepted. Anything else (javascript:, data:, mailto:)
 * yields null.
 */
export function resolveSafeUrl(raw: string | null, origin: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(t) || t.startsWith('//');
  if (!isAbsolute && !origin) return null;
  try {
    const u = isAbsolute ? new URL(t) : new URL(t, origin!);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

const RECORDING_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|kaltura\.com|panopto\.com|panopto\.eu|zoom\.us|echo360\.org|echo360\.com|vidgrid\.com|yuja\.com)$/i;

/** Classify a link topic from its resolved URL. */
export function classifyUrl(url: string | null, origin: string | null): SourceType {
  if (!url) return 'unavailable';
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const onBrightspace = origin !== null && u.origin === origin;

  if (onBrightspace) {
    const type = u.searchParams.get('type')?.toLowerCase();
    if (path.endsWith('/quickLink/quickLink.d2l')) {
      if (type === 'lti') return 'recording_lti';
      if (type === 'coursefile') return 'brightspace_file';
    }
    if (/\/d2l\/le\/lti\//i.test(path) || /\/d2l\/lti\//i.test(path)) return 'recording_lti';
    if (path.startsWith('/content/enforced/')) return 'brightspace_file';
    return 'brightspace_page';
  }
  if (host === 'drive.google.com') {
    if (/\/drive\/(u\/\d+\/)?folders\//.test(path) || /\/embeddedfolderview/.test(path)) return 'google_drive_folder';
    return 'google_drive_file';
  }
  if (host === 'docs.google.com') {
    if (/^\/(document|spreadsheets|presentation|forms)\//.test(path)) return 'google_doc';
    return 'google_drive_file';
  }
  if (RECORDING_HOSTS.test(host)) return 'recording_lti';
  return 'external_link';
}

const NON_AUTH_TOOL_ERRORS: { test: RegExp; kind: ConnectorError['kind']; message: string }[] = [
  { test: /^Resource not found/, kind: 'tool', message: 'Brightspace could not find this course’s content, or this account can’t see it.' },
  { test: /^Access denied/, kind: 'tool', message: 'Brightspace refused access to this course’s content for this account.' },
  { test: /^Rate limited/, kind: 'tool', message: 'Brightspace is rate-limiting requests. Wait a moment and try again.' },
  { test: /^Could not connect to Brightspace/, kind: 'tool', message: 'Couldn’t reach Brightspace. Check the internet connection and try again.' },
  { test: /^Invalid input/, kind: 'tool', message: 'The course ID was rejected by the Brightspace connector.' },
  { test: /^An unexpected error occurred/, kind: 'tool', message: 'Brightspace returned an unexpected error. Try again.' },
];

/** Connector error text from a data tool: known non-auth failures first, then auth classification. */
function toolErrorFrom(text: string | undefined): ConnectorError {
  const t = text?.trim() ?? '';
  for (const e of NON_AUTH_TOOL_ERRORS) if (e.test.test(t)) return new ConnectorError(e.kind, e.message);
  return authErrorFrom(t || undefined);
}

const MAX_TEXT = 4000;
const clip = (s: string | null) => (s && s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

interface ParseCtx {
  courseId: number;
  origin: string | null;
  topics: number;
  modules: number;
  /** When set, collects each topic's inline HTML body (by topic ID) for import. */
  inline?: Map<number, string>;
}

function parseTopic(r: Record<string, unknown>, ctx: ParseCtx): ContentTopic | null {
  const id = typeof r.id === 'number' && Number.isSafeInteger(r.id) ? r.id : null;
  const title = str(r.title);
  if (id === null || !title) return null;

  const topicType = r.topicType === 'file' ? 'file' : r.topicType === 'link' ? 'link' : 'other';
  const sourceUrl = str(r.url);
  let url: string | null;
  let sourceType: SourceType;

  if (r.embeddedMedia === true) {
    // D2L embedded media (ContentService): playable in Brightspace, no file behind it.
    url = ctx.origin ? `${ctx.origin}/d2l/le/content/${ctx.courseId}/viewContent/${id}/View` : null;
    sourceType = 'recording_lti';
  } else if (topicType === 'file') {
    // File topics carry no URL; link to the topic's Brightspace viewer.
    url = ctx.origin ? `${ctx.origin}/d2l/le/content/${ctx.courseId}/viewContent/${id}/View` : null;
    sourceType = 'brightspace_file';
  } else if (topicType === 'link') {
    url = resolveSafeUrl(sourceUrl, ctx.origin);
    sourceType = classifyUrl(url, ctx.origin);
  } else {
    // HTML page or other Brightspace-native topic.
    url = ctx.origin ? `${ctx.origin}/d2l/le/content/${ctx.courseId}/viewContent/${id}/View` : null;
    sourceType = url ? 'brightspace_page' : 'unavailable';
  }

  ctx.topics++;
  if (ctx.inline && typeof r.content === 'string' && r.content.trim()) ctx.inline.set(id, r.content);
  return {
    kind: 'topic',
    key: String(id),
    id,
    title,
    topicType,
    sourceType,
    description: clip(str(r.description)),
    hasInlineContent: typeof r.content === 'string' && r.content.trim().length > 0,
    url,
    sourceUrl,
    lastModified: str(r.lastModified),
    isHidden: r.isHidden === true,
    isLocked: r.isLocked === true,
    isAvailable: r.isAvailable !== false,
    availabilityMessage: str(r.availabilityMessage),
    isCompleted: bool(r.isCompleted),
    origin: 'topic',
  };
}

function courseFileTopic(path: string, moduleId: number, ctx: ParseCtx): ContentTopic {
  const sourceUrl = `/d2l/common/dialogs/quickLink/quickLink.d2l?ou=${ctx.courseId}&type=coursefile&fileId=${encodeURIComponent(path)}`;
  ctx.topics++;
  return {
    kind: 'topic',
    key: `coursefile:${moduleId}:${path}`,
    id: null,
    title: path.split('/').pop() || path,
    topicType: 'file',
    sourceType: 'brightspace_file',
    description: `Course file linked from the module description (${path}).`,
    hasInlineContent: false,
    url: resolveSafeUrl(sourceUrl, ctx.origin),
    sourceUrl,
    lastModified: null,
    isHidden: false,
    isLocked: false,
    isAvailable: true,
    availabilityMessage: null,
    isCompleted: null,
    origin: 'module_description',
  };
}

function parseModule(r: Record<string, unknown>, ctx: ParseCtx, depth: number): ContentModule | null {
  const id = typeof r.id === 'number' && Number.isSafeInteger(r.id) ? r.id : null;
  const title = str(r.title);
  if (id === null || !title) return null;
  ctx.modules++;

  const children: (ContentModule | ContentTopic)[] = [];
  if (Array.isArray(r.courseFiles)) {
    for (const p of r.courseFiles) if (typeof p === 'string' && p.trim()) children.push(courseFileTopic(p, id, ctx));
  }
  if (Array.isArray(r.children) && depth < 12) {
    for (const c of r.children) {
      const node = parseNode(c, ctx, depth + 1);
      if (node) children.push(node);
    }
  }
  const unavailable = r.childrenUnavailable as { reason?: unknown } | undefined;
  return {
    kind: 'module',
    id,
    title,
    description: clip(str(r.description)),
    lastModified: str(r.lastModified),
    isHidden: r.isHidden === true,
    isLocked: r.isLocked === true,
    isAvailable: r.isAvailable !== false,
    availabilityMessage: str(r.availabilityMessage),
    childrenUnavailable: unavailable ? str(unavailable.reason) ?? 'Brightspace didn’t return this module’s contents.' : r.children === null ? 'Brightspace didn’t return this module’s contents.' : null,
    children,
  };
}

function parseNode(raw: unknown, ctx: ParseCtx, depth: number): ContentModule | ContentTopic | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.type === 'module') return parseModule(r, ctx, depth);
  if (r.type === 'topic') return parseTopic(r, ctx);
  return null;
}

/** Validate get_course_content JSON into TrojanMind's content tree, preserving order. */
export function parseCourseContent(result: unknown, courseId: number, origin: string | null, inline?: Map<number, string>): CourseContent {
  const blocks = textBlocks(result);
  if (isErrorResult(result)) throw toolErrorFrom(blocks[0]);
  if (blocks.length === 0) throw new ConnectorError('parse', 'Brightspace returned an empty response for this course.');

  let data: unknown;
  try {
    data = JSON.parse(blocks[0]);
  } catch {
    throw toolErrorFrom(blocks[0]);
  }
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.contentTree)) {
    throw new ConnectorError('parse', 'Unexpected course content format from Brightspace.');
  }
  if (typeof d.courseId === 'number' && d.courseId !== courseId) {
    throw new ConnectorError('parse', 'Brightspace returned content for a different course.');
  }

  const ctx: ParseCtx = { courseId, origin, topics: 0, modules: 0, inline };
  const modules: ContentModule[] = [];
  const looseTopics: ContentTopic[] = [];
  for (const raw of d.contentTree) {
    const node = parseNode(raw, ctx, 0);
    if (node?.kind === 'module') modules.push(node);
    else if (node?.kind === 'topic') looseTopics.push(node);
  }

  const notices: string[] = [];
  if (typeof d.notice === 'string') notices.push('Some modules’ contents couldn’t be read from Brightspace; they’re marked below and may not be empty.');
  if (typeof d.progressUnavailable === 'string') notices.push('Completion progress couldn’t be read, so completion isn’t shown.');
  if (!origin) notices.push('The Brightspace base URL is unknown, so relative Brightspace links can’t be opened. Set BRIGHTSPACE_BASE_URL in server/.env.local.');

  return { modules, looseTopics, topicCount: ctx.topics, moduleCount: ctx.modules, notices };
}

export async function getCourseContent(courseId: number, origin: string | null): Promise<CourseContent> {
  return parseCourseContent(await call('get_course_content', { courseId }), courseId, origin);
}

/** Content tree plus each topic's inline HTML body, for importing selected pages. */
export async function getCourseContentForImport(courseId: number, origin: string | null): Promise<{ content: CourseContent; inlineHtml: Map<number, string> }> {
  const inlineHtml = new Map<number, string>();
  const content = parseCourseContent(await call('get_course_content', { courseId }), courseId, origin, inlineHtml);
  return { content, inlineHtml };
}

// ── Upcoming dates (get_upcoming_due_dates) ─────────────────────────────────

/**
 * exam  – title names an exam, midterm, final or test
 * quiz  – a Brightspace quiz, or a title naming a quiz
 * other – assignments, weekly markers, labs, etc.
 */
export type DateKind = 'exam' | 'quiz' | 'other';

export interface UpcomingDate {
  id: string;
  /** Brightspace's item type: event | assignment | quiz | discussion. */
  source: string;
  kind: DateKind;
  title: string;
  courseId: number | null;
  courseName: string | null;
  /** ISO 8601 instant (Brightspace's due/end date). */
  date: string;
  url: string | null;
}

const EXAM_TITLE = /\b(exams?|midterms?|mid-terms?|finals?|tests?)\b/i;
const QUIZ_TITLE = /\bquiz(zes)?\b/i;

export function classifyDate(source: string, title: string): DateKind {
  if (EXAM_TITLE.test(title)) return 'exam';
  if (source === 'quiz' || QUIZ_TITLE.test(title)) return 'quiz';
  return 'other';
}

/** Validate get_upcoming_due_dates JSON, keeping only the fields TrojanMind shows. */
export function parseUpcomingDates(result: unknown, origin: string | null): UpcomingDate[] {
  const blocks = textBlocks(result);
  if (isErrorResult(result)) throw toolErrorFrom(blocks[0]);
  if (blocks.length === 0) return [];
  let data: unknown;
  try {
    data = JSON.parse(blocks[0]);
  } catch {
    throw toolErrorFrom(blocks[0]);
  }
  if (!Array.isArray(data)) throw new ConnectorError('parse', 'Unexpected due-date format from Brightspace.');

  const out: UpcomingDate[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = str(r.title);
    const date = str(r.dueDate) ?? str(r.endDate) ?? str(r.startDate);
    if (!title || !date || Number.isNaN(Date.parse(date))) continue;
    const source = str(r.type) ?? 'event';
    out.push({
      id: `${source}:${typeof r.id === 'number' || typeof r.id === 'string' ? r.id : out.length}`,
      source,
      kind: classifyDate(source, title),
      title,
      courseId: typeof r.courseId === 'number' ? r.courseId : null,
      courseName: str(r.courseName),
      date,
      url: resolveSafeUrl(str(r.url), origin),
    });
  }
  return out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** Everything due or scheduled in the next `daysAhead` days (connector max 90), calendar events included. */
export async function getUpcomingDates(origin: string | null, daysAhead = 90): Promise<UpcomingDate[]> {
  return parseUpcomingDates(await call('get_upcoming_due_dates', { daysAhead }), origin);
}

// ── File text retrieval (download_file, inline mode) ────────────────────────

/**
 * Why a selected item produced no text. Codes only: the UI words them.
 * Connector prose is never forwarded.
 */
export type RetrievalFailure =
  | 'no_text_layer'      // PDF with no text layer (likely scanned)
  | 'no_office_text'     // Office file with no readable text
  | 'image_only'         // image file: nothing to read as text
  | 'unsupported_type'   // binary format the connector can't read inline
  | 'too_large'          // over the connector's 10 MB inline cap
  | 'not_released'       // not yet open / ended / locked / hidden
  | 'not_found'          // moved, deleted, or not visible to this account
  | 'access_denied'
  | 'rate_limited'
  | 'unreachable'
  | 'empty'
  | 'unknown';

export type FileTextResult =
  | { ok: true; text: string; truncated: boolean; pages: number | null; mimeType: string | null }
  | { ok: false; reason: RetrievalFailure };

const SECTION_HEADER = /^--- (Extracted PDF text|Extracted text|File contents)\b[^\n]*---\n/;

function failureFromToolError(text: string): RetrievalFailure {
  const t = text.trim();
  if (/too large/i.test(t)) return 'too_large';
  if (/not (yet )?(open|released|available)|has ended|is locked|is hidden|not been released/i.test(t)) return 'not_released';
  if (/^Resource not found|not found|moved or deleted|web page instead of the course file/i.test(t)) return 'not_found';
  if (/^Access denied|not be allowed|not allowed to open/i.test(t)) return 'access_denied';
  if (/^Rate limited/i.test(t)) return 'rate_limited';
  if (/^Could not connect to Brightspace/i.test(t)) return 'unreachable';
  if (/unsupported|undetectable|empty \(0 bytes\)|file type/i.test(t)) return 'unsupported_type';
  return 'unknown';
}

/** Sign-in problems stop the whole import; anything else fails just this item. */
function isAuthText(text: string): boolean {
  if (/web page instead of the course file/i.test(text)) return false;
  return /sign in|signed in|sign-in|session cookie|authenticat|Authenticator|Duo/i.test(text);
}

function authStop(text: string): ConnectorError {
  const outcome = classifyAuthText(text);
  return outcome.state === 'connected'
    ? new ConnectorError('auth', 'Brightspace sign-in needs attention. Click “Check again” on My Courses.', 'action_required')
    : new ConnectorError('auth', outcome.message, outcome.state);
}

/** Parse a download_file inline response into extracted text or a failure code. */
export function parseInlineDownload(result: unknown): FileTextResult {
  const blocks = textBlocks(result);
  if (isErrorResult(result)) {
    const msg = blocks[0] ?? '';
    if (isAuthText(msg)) throw authStop(msg);
    return { ok: false, reason: failureFromToolError(msg) };
  }
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(blocks[0] ?? '') as Record<string, unknown>;
  } catch {
    // A sign-in notice in place of the file.
    if (blocks[0] && isAuthText(blocks[0])) throw authStop(blocks[0]);
    return { ok: false, reason: 'unknown' };
  }
  const rep = meta.representation;
  const mimeType = str(meta.mimeType);
  if (rep === 'pdf_text_extraction_failed') return { ok: false, reason: 'no_text_layer' };
  if (rep === 'office_text_extraction_failed') return { ok: false, reason: 'no_office_text' };
  if (rep === 'image') return { ok: false, reason: 'image_only' };
  if (rep === 'binary_description_only') return { ok: false, reason: mimeType?.startsWith('image/') ? 'image_only' : 'unsupported_type' };
  if (rep !== 'extracted_text' && rep !== 'text') return { ok: false, reason: 'unknown' };

  const body = blocks[1];
  if (typeof body !== 'string') return { ok: false, reason: 'empty' };
  let text = body.replace(SECTION_HEADER, '');
  // Drop the connector's own truncation note; `truncated` records it instead.
  text = text.replace(/\n\n\[\.\.\.truncated at \d+ characters;[\s\S]*$/, '');
  if (mimeType === 'text/html') text = htmlToText(text);
  text = text.replace(/\r\n/g, '\n').trim();
  if (!text) return { ok: false, reason: 'empty' };
  return {
    ok: true,
    text,
    truncated: meta.truncated === true,
    pages: typeof meta.pages === 'number' ? meta.pages : null,
    mimeType,
  };
}

/** A content-topic file (download_file with topicId), as extracted text. */
export async function downloadTopicText(courseId: number, topicId: number): Promise<FileTextResult> {
  return parseInlineDownload(await call('download_file', { courseId, topicId }));
}

/** A course-file-store file (download_file with coursePath), as extracted text. */
export async function downloadCourseFileText(courseId: number, coursePath: string): Promise<FileTextResult> {
  return parseInlineDownload(await call('download_file', { courseId, coursePath }));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Readable plain text from a Brightspace HTML body. Text only: no markup survives. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|section|article|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function closeConnector(): Promise<void> {
  const p = clientPromise;
  clientPromise = null;
  if (p) await p.then((c) => c.close()).catch(() => undefined);
}
