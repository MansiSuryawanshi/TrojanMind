/**
 * Plain-text retrieval of Google Drive folders and files linked from Brightspace.
 *
 * Like googleDocs.ts this works only for items shared as "anyone with the
 * link can view": TrojanMind has no Google sign-in.
 *
 *  - Folder → the public "embeddedfolderview" listing, then each file in it
 *             (one level of subfolders), capped at MAX_FILES.
 *  - File   → Google Docs/Sheets/Slides via their text export; uploaded
 *             files via Drive's download endpoint, read as PDF, Word (.docx),
 *             PowerPoint (.pptx), or plain text.
 *
 * SSRF safety: only IDs are parsed out of links; every request URL is rebuilt
 * on Google hosts, and redirects are followed only to Google download hosts.
 */
import { inflateRawSync } from 'node:zlib';
import { htmlToText } from './brightspaceMcp.ts';
import { fetchGoogleDocText, parseGoogleDocUrl, type GoogleDocRef, type GoogleFailure } from './googleDocs.ts';

const ID = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 15;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;

export type DriveTextResult =
  | { ok: true; text: string; truncated: boolean; files: number; skipped: string[] }
  | { ok: false; reason: GoogleFailure };

// ── Link parsing ────────────────────────────────────────────────────────────

function safeUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

export function parseDriveFolderId(raw: string | null): string | null {
  const u = safeUrl(raw);
  if (!u || u.hostname.toLowerCase() !== 'drive.google.com') return null;
  const m = /\/folders\/([^/?#]+)/.exec(u.pathname);
  const id = m?.[1] ?? (/\/embeddedfolderview/.test(u.pathname) ? u.searchParams.get('id') : null);
  return id && ID.test(id) ? id : null;
}

export function parseDriveFileId(raw: string | null): string | null {
  const u = safeUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return null;
  const m = /\/file\/d\/([^/?#]+)/.exec(u.pathname);
  const id = m?.[1] ?? (/^\/(open|uc)$/.test(u.pathname) ? u.searchParams.get('id') : null);
  return id && ID.test(id) ? id : null;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function allowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'drive.google.com' || h === 'docs.google.com' || h === 'drive.usercontent.google.com' || h.endsWith('.googleusercontent.com');
}

type Fetched =
  | { ok: true; type: string; disposition: string; bytes: Buffer; truncated: boolean }
  | { ok: false; reason: GoogleFailure };

async function getBytes(start: string): Promise<Fetched> {
  let url = new URL(start);
  try {
    for (let hop = 0; ; hop++) {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'TrojanMind/1.0' } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!loc || hop >= MAX_REDIRECTS) return { ok: false, reason: 'google_unreachable' };
        const next = new URL(loc, url);
        if (next.hostname.toLowerCase() === 'accounts.google.com' || /ServiceLogin/i.test(next.pathname)) return { ok: false, reason: 'not_shared' };
        if (next.protocol !== 'https:' || !allowedHost(next.hostname)) return { ok: false, reason: 'not_shared' };
        url = next;
        continue;
      }
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not_shared' };
      if (res.status === 404 || res.status === 410) return { ok: false, reason: 'not_found' };
      if (!res.ok) return { ok: false, reason: 'google_unreachable' };
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      let truncated = false;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.byteLength > MAX_BYTES) {
          truncated = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
        size += value.byteLength;
      }
      return {
        ok: true,
        type: (res.headers.get('content-type') ?? '').toLowerCase(),
        disposition: res.headers.get('content-disposition') ?? '',
        bytes: Buffer.concat(chunks),
        truncated,
      };
    }
  } catch {
    return { ok: false, reason: 'google_unreachable' };
  }
}

// ── Folder listing ──────────────────────────────────────────────────────────

interface FolderEntry {
  title: string;
  kind: 'folder' | 'doc' | 'file';
  id: string;
  doc?: GoogleDocRef;
}

const decodeEntities = (s: string) => htmlToText(s).replace(/\s+/g, ' ').trim();

/** Parse the public embeddedfolderview page into entries. */
export function parseFolderListing(html: string): FolderEntry[] {
  const out: FolderEntry[] = [];
  const seen = new Set<string>();
  // Each entry: <div class="flip-entry" ...><a href="LINK" ...> ... <div class="flip-entry-title">TITLE</div>
  const re = /<a[^>]+href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const href = m[1].replace(/&amp;/g, '&');
    const titleM = /flip-entry-title[^>]*>([\s\S]*?)<\/div>/i.exec(m[2]);
    const title = titleM ? decodeEntities(titleM[1]) : decodeEntities(m[2]) || 'Untitled';
    const folderId = parseDriveFolderId(href);
    const doc = parseGoogleDocUrl(href);
    const fileId = parseDriveFileId(href);
    const entry: FolderEntry | null = folderId
      ? { title, kind: 'folder', id: folderId }
      : doc
        ? { title, kind: 'doc', id: doc.id, doc }
        : fileId
          ? { title, kind: 'file', id: fileId }
          : null;
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

async function listFolder(id: string): Promise<{ ok: true; entries: FolderEntry[] } | { ok: false; reason: GoogleFailure }> {
  const res = await getBytes(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}`);
  if (!res.ok) return res;
  const html = res.bytes.toString('utf-8');
  if (!/flip-entry|flip-list/i.test(html)) return { ok: false, reason: 'not_shared' };
  return { ok: true, entries: parseFolderListing(html) };
}

// ── File text extraction ────────────────────────────────────────────────────

/** Read named entries out of a ZIP (docx/pptx) using the central directory. */
function unzipEntries(buf: Buffer, want: (name: string) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf-8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name) || local + 30 > buf.length) continue;
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + compSize);
    try {
      out.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf-8'));
    } catch {
      /* skip unreadable entry */
    }
  }
  return out;
}

function ooxmlText(xml: string, paraTag: string): string {
  return decodeEntitiesKeepLines(
    xml
      .replace(new RegExp(`</${paraTag}>`, 'g'), '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<[^>]+>/g, ''),
  );
}

function decodeEntitiesKeepLines(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function docxText(buf: Buffer): string {
  const files = unzipEntries(buf, (n) => n === 'word/document.xml');
  return ooxmlText(files.get('word/document.xml') ?? '', 'w:p');
}

function pptxText(buf: Buffer): string {
  const files = unzipEntries(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return [...files.entries()]
    .sort(([a], [b]) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
    .map(([name, xml]) => `[Slide ${/(\d+)\.xml$/.exec(name)![1]}]\n${ooxmlText(xml, 'a:p')}`)
    .join('\n\n');
}

async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push(line.replace(/[ \t]+/g, ' ').trim());
  }
  await doc.destroy();
  return pages.filter(Boolean).join('\n\n');
}

function fileNameFrom(disposition: string): string {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(disposition) ?? /filename="?([^";]+)"?/i.exec(disposition);
  try {
    return m ? decodeURIComponent(m[1]).toLowerCase() : '';
  } catch {
    return m ? m[1].toLowerCase() : '';
  }
}

type FileText = { ok: true; text: string; truncated: boolean } | { ok: false; reason: GoogleFailure };

/** Download an uploaded Drive file and read it as text. */
export async function fetchDriveFileText(id: string): Promise<FileText> {
  const res = await getBytes(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`);
  if (!res.ok) return res;
  if (res.truncated) return { ok: false, reason: 'too_large' };
  const name = fileNameFrom(res.disposition);
  const { type, bytes } = res;
  try {
    let text = '';
    if (type.includes('pdf') || name.endsWith('.pdf')) text = await pdfText(bytes);
    else if (type.includes('wordprocessingml') || name.endsWith('.docx')) text = docxText(bytes);
    else if (type.includes('presentationml') || name.endsWith('.pptx')) text = pptxText(bytes);
    else if (type.includes('text/html')) {
      // A sign-in page or the "can't scan for viruses" interstitial, not the file.
      return { ok: false, reason: /accounts\.google\.com|ServiceLogin/i.test(bytes.toString('utf-8', 0, 20_000)) ? 'not_shared' : 'unsupported_type' };
    } else if (type.startsWith('text/') || /\.(txt|md|csv|py|java|c|cpp|js|ts|json)$/.test(name)) text = bytes.toString('utf-8');
    else return { ok: false, reason: 'unsupported_type' };
    text = text.trim();
    return text ? { ok: true, text, truncated: false } : { ok: false, reason: 'empty' };
  } catch {
    return { ok: false, reason: 'unsupported_type' };
  }
}

async function entryText(e: FolderEntry): Promise<FileText> {
  if (e.kind === 'doc' && e.doc) return fetchGoogleDocText(e.doc);
  // A Drive "file" link may still be a native Google Doc; try the doc export as a fallback.
  const r = await fetchDriveFileText(e.id);
  if (r.ok || r.reason !== 'unsupported_type') return r;
  return fetchGoogleDocText({ kind: 'document', id: e.id, published: false, gid: null });
}

/** Every readable file in a public folder (and its direct subfolders), concatenated. */
export async function fetchDriveFolderText(folderId: string, maxChars: number): Promise<DriveTextResult> {
  const top = await listFolder(folderId);
  if (!top.ok) return top;

  const files: { path: string; entry: FolderEntry }[] = [];
  for (const e of top.entries) {
    if (e.kind !== 'folder') files.push({ path: e.title, entry: e });
  }
  for (const sub of top.entries.filter((e) => e.kind === 'folder')) {
    if (files.length >= MAX_FILES) break;
    const listed = await listFolder(sub.id);
    if (!listed.ok) continue;
    for (const e of listed.entries) if (e.kind !== 'folder') files.push({ path: `${sub.title}/${e.title}`, entry: e });
  }
  if (files.length === 0) return { ok: false, reason: 'empty' };

  const skipped: string[] = files.slice(MAX_FILES).map((f) => `${f.path} (over the ${MAX_FILES}-file limit)`);
  const parts: string[] = [];
  let total = 0;
  let truncated = false;
  let read = 0;
  for (const f of files.slice(0, MAX_FILES)) {
    if (total >= maxChars) {
      truncated = true;
      skipped.push(`${f.path} (text limit reached)`);
      continue;
    }
    const r = await entryText(f.entry);
    if (!r.ok) {
      skipped.push(`${f.path} (${r.reason.replace(/_/g, ' ')})`);
      continue;
    }
    read++;
    const part = `--- ${f.path} ---\n${r.text}`;
    parts.push(part);
    total += part.length + 2;
    truncated ||= r.truncated;
  }
  if (read === 0) return { ok: false, reason: skipped.some((s) => s.includes('not shared')) ? 'not_shared' : 'empty' };
  // The "not imported" list always survives truncation.
  const footer = skipped.length ? `\n\n--- Not imported from this folder ---\n${skipped.map((s) => `• ${s}`).join('\n')}` : '';
  let text = parts.join('\n\n');
  const room = Math.max(0, maxChars - footer.length);
  if (text.length > room) {
    text = text.slice(0, room);
    truncated = true;
  }
  text += footer;
  return { ok: true, text, truncated, files: read, skipped };
}
