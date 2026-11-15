/**
 * Plain-text retrieval of Google Docs / Sheets / Slides linked from Brightspace.
 *
 * Only documents shared as "anyone with the link can view" (or published to
 * the web) can be read: TrojanMind has no Google sign-in, so anything else
 * comes back as `not_shared`.
 *
 * SSRF safety: the request URL is never taken from Brightspace. Only the
 * document kind and ID are parsed out of the link, and the export URL is
 * rebuilt on docs.google.com. Redirects are followed by hand and only to
 * Google's own download hosts.
 */
import { htmlToText } from './brightspaceMcp.ts';

export type GoogleKind = 'document' | 'spreadsheets' | 'presentation';

export interface GoogleDocRef {
  kind: GoogleKind;
  /** Document ID, or the "e/<id>" form of a published-to-web document. */
  id: string;
  published: boolean;
  /** Sheet tab, for spreadsheets. */
  gid: string | null;
}

export type GoogleFailure = 'not_shared' | 'not_found' | 'too_large' | 'google_unreachable' | 'empty' | 'unsupported_type';

export type GoogleTextResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: GoogleFailure };

const ID = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

/** Parse a docs.google.com link into a document reference, or null if it isn't one we can export. */
export function parseGoogleDocUrl(raw: string | null): GoogleDocRef | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.hostname.toLowerCase() !== 'docs.google.com') return null;
  // Optional Workspace prefix: /a/<domain>/document/d/...
  const m = /^\/(?:a\/[^/]+\/)?(document|spreadsheets|presentation)\/d\/(e\/)?([^/]+)/.exec(u.pathname);
  if (!m || !ID.test(m[3])) return null;
  const gidRaw = u.searchParams.get('gid') ?? /(?:^|[#&])gid=(\d+)/.exec(u.hash)?.[1] ?? null;
  return {
    kind: m[1] as GoogleKind,
    id: m[2] ? `e/${m[3]}` : m[3],
    published: Boolean(m[2]),
    gid: gidRaw && /^\d{1,20}$/.test(gidRaw) ? gidRaw : null,
  };
}

/** The export URL TrojanMind requests, built only from the parsed reference. */
export function exportUrl(ref: GoogleDocRef): string {
  const base = `https://docs.google.com/${ref.kind}/d/${ref.id}`;
  if (ref.published) {
    if (ref.kind === 'document') return `${base}/pub?output=txt`;
    if (ref.kind === 'spreadsheets') return `${base}/pub?output=csv${ref.gid ? `&gid=${ref.gid}` : ''}`;
    return `${base}/pub`; // published slides: HTML only
  }
  if (ref.kind === 'spreadsheets') return `${base}/export?format=csv${ref.gid ? `&gid=${ref.gid}` : ''}`;
  return `${base}/export?format=txt`;
}

function allowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'docs.google.com' || h.endsWith('.googleusercontent.com');
}

function isSignInRedirect(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return h === 'accounts.google.com' || /\/ServiceLogin|\/accounts\//i.test(u.pathname);
}

async function readCapped(res: Response): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: '', truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > MAX_BYTES) {
      chunks.push(value.subarray(0, MAX_BYTES - size));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  return { text: new TextDecoder('utf-8').decode(Buffer.concat(chunks)), truncated };
}

/** Fetch one Google Doc / Sheet / Slides deck as plain text. Never throws. */
export async function fetchGoogleDocText(ref: GoogleDocRef): Promise<GoogleTextResult> {
  let url = new URL(exportUrl(ref));
  try {
    for (let hop = 0; ; hop++) {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'TrojanMind/1.0', Accept: 'text/plain, text/csv, text/html;q=0.5' },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!loc || hop >= MAX_REDIRECTS) return { ok: false, reason: 'google_unreachable' };
        const next = new URL(loc, url);
        if (isSignInRedirect(next)) return { ok: false, reason: 'not_shared' };
        if (next.protocol !== 'https:' || !allowedHost(next.hostname)) return { ok: false, reason: 'not_shared' };
        url = next;
        continue;
      }
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not_shared' };
      if (res.status === 404 || res.status === 410) return { ok: false, reason: 'not_found' };
      if (!res.ok) return { ok: false, reason: 'google_unreachable' };

      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      const { text: body, truncated } = await readCapped(res);
      let text: string;
      if (type.includes('text/html')) {
        // Expected only for published slides; anywhere else it's a sign-in or interstitial page.
        if (!(ref.published && ref.kind === 'presentation')) return { ok: false, reason: 'not_shared' };
        text = htmlToText(body);
      } else if (type.startsWith('text/') || type.includes('csv')) {
        text = body.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
      } else {
        return { ok: false, reason: 'unsupported_type' };
      }
      if (!text) return { ok: false, reason: 'empty' };
      return { ok: true, text, truncated };
    }
  } catch {
    return { ok: false, reason: 'google_unreachable' };
  }
}

/** Google Docs links (iframe src or href) inside a Brightspace page body, de-duplicated. */
export function googleDocsInHtml(html: string, limit = 5): GoogleDocRef[] {
  const out: GoogleDocRef[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const ref = parseGoogleDocUrl(m[1].replace(/&amp;/g, '&'));
    if (!ref) continue;
    const k = `${ref.kind}:${ref.id}:${ref.gid ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(ref);
    if (out.length >= limit) break;
  }
  return out;
}
