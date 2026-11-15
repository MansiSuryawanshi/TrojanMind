/**
 * Browser → localhost TrojanMind API for Piazza (never MCP stdio from the client).
 */
import { auth } from './firebaseConfig';
import type { PiazzaClass, PiazzaPostDetail, PiazzaPostSummary } from '../types/piazza';

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to TrojanMind first.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readJson(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const e = (body as { error?: { message?: unknown } }).error;
    if (e && typeof e.message === 'string' && e.message.trim()) return e.message;
  }
  return fallback;
}

export type PiazzaConnectResult =
  | { state: 'connected'; classes: PiazzaClass[]; email: string | null; retrievedAt: string }
  | { state: 'pending'; message: string };

export async function connectPiazza(force = false): Promise<PiazzaConnectResult> {
  const res = await fetch('/local-api/piazza/connect', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ force }),
    cache: 'no-store',
  });
  const body = await readJson(res);
  if (res.ok && body && typeof body === 'object' && (body as { state?: string }).state === 'pending') {
    return { state: 'pending', message: String((body as { message?: string }).message ?? 'Finish Piazza login in the browser window.') };
  }
  if (!res.ok) throw new Error(errMessage(body, 'Could not connect to Piazza.'));
  const b = body as { classes?: unknown; email?: unknown; retrievedAt?: unknown };
  return {
    state: 'connected',
    classes: Array.isArray(b.classes) ? (b.classes as PiazzaClass[]) : [],
    email: typeof b.email === 'string' ? b.email : null,
    retrievedAt: typeof b.retrievedAt === 'string' ? b.retrievedAt : new Date().toISOString(),
  };
}

export async function fetchPiazzaClasses(): Promise<PiazzaClass[]> {
  const res = await fetch('/local-api/piazza/classes', { headers: await authHeaders(), cache: 'no-store' });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, 'Could not load Piazza classes.'));
  const classes = (body as { classes?: unknown })?.classes;
  return Array.isArray(classes) ? (classes as PiazzaClass[]) : [];
}

export async function fetchPiazzaPosts(
  classId: string,
  opts: { q?: string; limit?: number; offset?: number } = {},
): Promise<{ posts: PiazzaPostSummary[]; coverageNote: string }> {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`/local-api/piazza/classes/${encodeURIComponent(classId)}/posts${qs ? `?${qs}` : ''}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, 'Could not load Piazza posts.'));
  const b = body as { posts?: unknown; coverageNote?: unknown };
  return {
    posts: Array.isArray(b.posts) ? (b.posts as PiazzaPostSummary[]) : [],
    coverageNote: typeof b.coverageNote === 'string' ? b.coverageNote : 'Recent authorized posts.',
  };
}

export async function readPiazzaPosts(classId: string, posts: Array<string | number>): Promise<PiazzaPostDetail[]> {
  // Server accepts up to 30; callers may batch larger sets.
  const res = await fetch(`/local-api/piazza/classes/${encodeURIComponent(classId)}/read`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ posts: posts.slice(0, 30) }),
    cache: 'no-store',
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errMessage(body, 'Could not read Piazza posts.'));
  const list = (body as { posts?: unknown })?.posts;
  return Array.isArray(list) ? (list as PiazzaPostDetail[]) : [];
}

/** Open only allowlisted Piazza URLs. */
export function openPiazzaUrl(url: string | null | undefined, courseId?: string): void {
  const href = validatePiazzaHref(url, courseId);
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

export function validatePiazzaHref(url: string | null | undefined, courseId?: string): string | null {
  const fallback = courseId ? `https://piazza.com/class/${encodeURIComponent(courseId)}` : null;
  if (!url) return fallback;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return fallback;
    const host = u.hostname.toLowerCase();
    if (host !== 'piazza.com' && host !== 'www.piazza.com') return fallback;
    return u.href;
  } catch {
    return fallback;
  }
}
