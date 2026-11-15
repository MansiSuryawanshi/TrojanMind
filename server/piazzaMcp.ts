/**
 * Piazza connector for TrojanMind's local demo.
 *
 * Uses the same client/session stack as the piazza-mcp package (browser SSO or
 * optional email/password). The browser never talks to Piazza or MCP stdio —
 * only this localhost server does.
 *
 * Tool coverage maps to the Piazza MCP surface:
 *   list_courses  → listClasses()
 *   fetch_posts   → listRecentPosts() / searchPosts() / readPosts()
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PIAZZA_EMAIL,
  PIAZZA_PASSWORD,
  piazzaMcpHome,
} from './config.ts';

export class PiazzaConnectorError extends Error {
  readonly kind: 'launch' | 'auth' | 'pending' | 'parse' | 'tool';
  constructor(kind: PiazzaConnectorError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

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

const PIAZZA_HOST = 'https://piazza.com';
const require = createRequire(import.meta.url);

type PiazzaClientInstance = {
  login: (opts?: { force?: boolean }) => Promise<unknown>;
  getStatus: (opts?: { refresh?: boolean }) => Promise<Record<string, unknown>>;
  getClasses: () => Promise<Record<string, unknown>[]>;
  resolveClass: (classId?: string) => Promise<Record<string, unknown>>;
  getFeed: (nid: string, opts?: { limit?: number; offset?: number }) => Promise<Record<string, unknown>[]>;
  search: (nid: string, query: string) => Promise<Record<string, unknown>[]>;
  filterFeed: (nid: string, filter: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  getPost: (nid: string, cid: string | number) => Promise<Record<string, unknown>>;
};

let clientPromise: Promise<PiazzaClientInstance> | null = null;

function resolvePiazzaSrc(file: string): string {
  const pkgJson = require.resolve('piazza-mcp/package.json');
  return pathToFileURL(join(dirname(pkgJson), 'src', file)).href;
}

async function loadClient(): Promise<PiazzaClientInstance> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    // Align optional credentials / home with our server env before the module reads them.
    if (PIAZZA_EMAIL) process.env.PIAZZA_EMAIL = PIAZZA_EMAIL;
    if (PIAZZA_PASSWORD) process.env.PIAZZA_PASSWORD = PIAZZA_PASSWORD;
    const home = piazzaMcpHome();
    if (home) process.env.PIAZZA_MCP_HOME = home;

    const mod = await import(resolvePiazzaSrc('piazza.js'));
    const PiazzaClient = (mod as { PiazzaClient: new () => PiazzaClientInstance }).PiazzaClient;
    if (!PiazzaClient) throw new PiazzaConnectorError('launch', 'Could not load the Piazza connector client.');
    return new PiazzaClient();
  })().catch((err) => {
    clientPromise = null;
    const msg = err instanceof Error ? err.message : '';
    console.error('[piazza] failed to load client', msg);
    throw new PiazzaConnectorError('launch', 'Could not start the local Piazza connector (piazza-mcp).');
  });
  return clientPromise;
}

function isActiveClass(network: Record<string, unknown>): boolean {
  const status = network.status;
  return !status || status === 'active';
}

function stripHtml(value: unknown, max = 220): string {
  const text = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function latestHistory(item: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const history = item?.history;
  if (!Array.isArray(history) || history.length === 0) return undefined;
  const first = history[0];
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : undefined;
}

function isoDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const date = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function postPermalink(nid: string, post: Record<string, unknown>): string {
  const cid = post.nr ?? post.id;
  return `${PIAZZA_HOST}/class/${encodeURIComponent(nid)}?cid=${encodeURIComponent(String(cid))}`;
}

function sourceVersion(post: Record<string, unknown>): string {
  const modified = post.modified ?? post.updated ?? post.created ?? '';
  const children = Array.isArray(post.children) ? post.children.length : 0;
  const hasI = post.has_i ? 1 : 0;
  const hasS = post.has_s ? 1 : 0;
  return `${String(modified)}|c${children}|i${hasI}|s${hasS}`;
}

function toSummary(nid: string, item: Record<string, unknown>): PiazzaPostSummary {
  const head = latestHistory(item);
  const nr = typeof item.nr === 'number' ? item.nr : typeof item.nr === 'string' && /^\d+$/.test(item.nr) ? Number(item.nr) : null;
  const type = typeof item.type === 'string' ? item.type : 'question';
  const folders = Array.isArray(item.folders) ? item.folders.filter((f): f is string => typeof f === 'string') : [];
  const hasInstructorAnswer = item.has_i === true || item.has_i === 1;
  const hasStudentAnswer = item.has_s === true || item.has_s === 1;
  const unanswered =
    type === 'question' && !hasInstructorAnswer && !hasStudentAnswer && item.no_answer !== 0;
  const pinned = item.pin === 1 || item.pin === true;
  const config = item.config && typeof item.config === 'object' ? (item.config as Record<string, unknown>) : {};
  const isAnnouncement = config.is_announcement === 1 || config.is_announcement === true || folders.some((f) => /announce/i.test(f));

  return {
    id: String(item.id ?? nr ?? ''),
    nr,
    subject: stripHtml(item.subject ?? head?.subject ?? '(no subject)', 160) || '(no subject)',
    snippet: stripHtml(
      item.content_snipet ?? item.content_snippet ?? item.snippet ?? head?.content ?? '',
      200,
    ),
    type,
    folders,
    hasInstructorAnswer,
    hasStudentAnswer,
    unanswered,
    pinned,
    isAnnouncement,
    modifiedAt: isoDate(item.modified ?? item.updated ?? item.created),
    createdAt: isoDate(item.created),
    url: postPermalink(nid, item),
    sourceVersion: sourceVersion(item),
  };
}

function childText(child: Record<string, unknown>): string {
  const head = latestHistory(child);
  return stripHtml(head?.content ?? child.subject ?? '', 4000);
}

function isInstructorEndorsed(child: Record<string, unknown>): boolean {
  const tags = child.tag_endorse;
  if (!Array.isArray(tags)) return false;
  return tags.some((e) => {
    if (!e || typeof e !== 'object') return false;
    const role = String((e as Record<string, unknown>).role ?? '').toLowerCase();
    return role === 'instructor' || role === 'professor' || role === 'ta';
  });
}

function toDetail(nid: string, post: Record<string, unknown>): PiazzaPostDetail {
  const summary = toSummary(nid, post);
  const head = latestHistory(post);
  const children = Array.isArray(post.children) ? (post.children as Record<string, unknown>[]) : [];
  const answers: PiazzaAnswer[] = [];
  for (const child of children) {
    const type = child.type;
    if (type !== 'i_answer' && type !== 's_answer') continue;
    const text = childText(child);
    if (!text) continue;
    answers.push({
      type: type === 'i_answer' ? 'instructor' : 'student',
      text,
      endorsedByInstructor: type === 's_answer' && isInstructorEndorsed(child),
      updatedAt: isoDate(latestHistory(child)?.created ?? child.created),
    });
  }
  const followups = children
    .filter((c) => c.type === 'followup')
    .map((c) => ({ text: childText(c), createdAt: isoDate(c.created) }))
    .filter((f) => f.text);

  return {
    ...summary,
    body: stripHtml(head?.content ?? '', 6000),
    answers,
    followups,
  };
}

function mapClass(network: Record<string, unknown>): PiazzaClass {
  const courseNumber = typeof network.course_number === 'string' ? network.course_number : null;
  const name = typeof network.name === 'string' ? network.name : courseNumber || String(network.id ?? 'Class');
  const term = typeof network.term === 'string' ? network.term : null;
  const folders = Array.isArray(network.folders) ? network.folders.filter((f): f is string => typeof f === 'string') : [];
  return {
    id: String(network.id),
    name,
    courseNumber,
    term,
    folders,
    isActive: isActiveClass(network),
  };
}

function classifyLoginError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (/browser window opened|finish logging in|LoginPending/i.test(msg)) {
    throw new PiazzaConnectorError('pending', 'A browser window opened so you can log in to Piazza. Finish signing in there, then try again.');
  }
  if (/session|log ?in|auth|401|403|rejected/i.test(msg)) {
    throw new PiazzaConnectorError('auth', 'Piazza sign-in is required. Connect Piazza and complete login in the browser window.');
  }
  throw new PiazzaConnectorError('tool', 'Piazza could not complete that request.');
}

/** Trigger login (browser SSO or env credentials) and return signed-in classes. */
export async function connectPiazza(force = false): Promise<{ classes: PiazzaClass[]; email: string | null; retrievedAt: string }> {
  try {
    const client = await loadClient();
    await client.login({ force });
    const status = await client.getStatus({ refresh: true });
    const networks = Array.isArray(status.networks) ? (status.networks as Record<string, unknown>[]) : [];
    const classes = networks.filter(isActiveClass).map(mapClass);
    const email = typeof status.email === 'string' ? status.email : null;
    return { classes, email, retrievedAt: new Date().toISOString() };
  } catch (err) {
    if (err instanceof PiazzaConnectorError) throw err;
    classifyLoginError(err);
  }
}

export async function listClasses(includeInactive = false): Promise<PiazzaClass[]> {
  try {
    const client = await loadClient();
    const networks = await client.getClasses();
    return networks
      .filter((n) => includeInactive || isActiveClass(n))
      .map(mapClass);
  } catch (err) {
    if (err instanceof PiazzaConnectorError) throw err;
    classifyLoginError(err);
  }
}

export async function listRecentPosts(classId: string, limit = 30, offset = 0): Promise<{ posts: PiazzaPostSummary[]; coverageNote: string }> {
  try {
    const client = await loadClient();
    const network = await client.resolveClass(classId);
    const nid = String(network.id);
    const capped = Math.min(Math.max(limit, 1), 100);
    const feed = await client.getFeed(nid, { limit: capped + offset, offset: 0 });
    const page = feed.slice(offset, offset + capped).map((p) => toSummary(nid, p));
    return {
      posts: page,
      coverageNote: `Showing ${page.length} recently updated posts (bounded sync; older posts available via search).`,
    };
  } catch (err) {
    if (err instanceof PiazzaConnectorError) throw err;
    classifyLoginError(err);
  }
}

export async function searchPosts(classId: string, query: string, limit = 30): Promise<PiazzaPostSummary[]> {
  try {
    const client = await loadClient();
    const network = await client.resolveClass(classId);
    const nid = String(network.id);
    const q = query.trim();
    const capped = Math.min(Math.max(limit, 1), 100);
    if (!q) return (await listRecentPosts(classId, capped)).posts;
    const items = await client.search(nid, q);
    return items.slice(0, capped).map((p) => toSummary(nid, p));
  } catch (err) {
    if (err instanceof PiazzaConnectorError) throw err;
    classifyLoginError(err);
  }
}

export async function readPosts(classId: string, refs: Array<string | number>): Promise<PiazzaPostDetail[]> {
  try {
    const client = await loadClient();
    const network = await client.resolveClass(classId);
    const nid = String(network.id);
    const unique = [...new Set(refs.map((r) => String(r).trim().replace(/^[@#]/, '')).filter(Boolean))].slice(0, 30);
    const details: PiazzaPostDetail[] = [];
    for (const ref of unique) {
      const cid = /^\d+$/.test(ref) ? Number(ref) : ref;
      const post = await client.getPost(nid, cid);
      details.push(toDetail(nid, post));
    }
    return details;
  } catch (err) {
    if (err instanceof PiazzaConnectorError) throw err;
    classifyLoginError(err);
  }
}

/** Validated Piazza post URL for redirect, or course page fallback. */
export function safePiazzaUrl(url: string | null | undefined, courseId?: string): string | null {
  if (!url || typeof url !== 'string') {
    return courseId ? `${PIAZZA_HOST}/class/${encodeURIComponent(courseId)}` : null;
  }
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return courseId ? `${PIAZZA_HOST}/class/${encodeURIComponent(courseId)}` : null;
    const host = u.hostname.toLowerCase();
    if (host !== 'piazza.com' && host !== 'www.piazza.com') {
      return courseId ? `${PIAZZA_HOST}/class/${encodeURIComponent(courseId)}` : null;
    }
    return u.href;
  } catch {
    return courseId ? `${PIAZZA_HOST}/class/${encodeURIComponent(courseId)}` : null;
  }
}

export async function closePiazzaConnector(): Promise<void> {
  clientPromise = null;
}
