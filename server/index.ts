/**
 * TrojanMind local connector: a tiny localhost-only HTTP backend that lets the
 * owner of this computer view their Brightspace courses through the locally
 * configured brightspace-mcp-server.
 *
 * NOT for public deployment. It binds to 127.0.0.1, accepts only a verified
 * Firebase ID token belonging to LOCAL_BRIGHTSPACE_OWNER_UID, returns course
 * data only when the Brightspace session belongs to
 * LOCAL_BRIGHTSPACE_EXPECTED_UNIQUE_NAME, and is excluded from Vercel via
 * .vercelignore.
 *
 * POST /brightspace/courses/:id/import (owner only, same identity checks)
 * retrieves readable text for the selected topic keys only, resolved against a
 * fresh content tree, and streams one NDJSON result per item.
 *
 * POST /ai/messages proxies Claude for every TrojanMind AI feature, for any
 * verified user; ANTHROPIC_API_KEY stays on this server.
 *
 * Piazza routes (/piazza/*) use the local piazza-mcp client/session for the
 * configured LOCAL_PIAZZA_OWNER_UID only. Credentials never leave the server.
 *
 * Per-user connection status (GET /connections) is available to any verified
 * user, but only ever describes the caller's own UID. Individual Brightspace
 * connections are modelled but not available yet (no registered OAuth app).
 *
 * Run: npm run server
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  ALLOWED_ORIGINS,
  EXPECTED_UNIQUE_NAME,
  FIREBASE_PROJECT_ID,
  HAS_ADMIN_CREDENTIALS,
  HOST,
  OWNER_UID,
  PIAZZA_OWNER_UID,
  PORT,
} from './config.ts';
import {
  ConnectorError,
  closeConnector,
  getBrightspaceOrigin,
  getCourseContent,
  getCourseContentForImport,
  getMyCourses,
  getSignedInUniqueName,
  getUpcomingDates,
  signIn,
  type AuthState,
  type BrightspaceCourse,
  type CourseContent,
} from './brightspaceMcp.ts';
import {
  PiazzaConnectorError,
  closePiazzaConnector,
  connectPiazza,
  listClasses,
  listRecentPosts,
  readPosts,
  safePiazzaUrl,
  searchPosts,
} from './piazzaMcp.ts';
import {
  InMemoryConnectionStore,
  describeConnection,
  setState,
  type ConnectionMethod,
  type ConnectionState,
} from './connections.ts';
import { finalsSourceFor, officialFinalFor, supportedTerms, type OfficialFinal } from './uscFinals.ts';
import { importOne, indexTopics, parseImportKeys, MAX_IMPORT_ITEMS } from './materialImport.ts';
import { AiRequestError, aiConfigured, forwardToAnthropic, sanitizeAiBody } from './aiProxy.ts';

if (!FIREBASE_PROJECT_ID) {
  console.error('[server] FIREBASE_PROJECT_ID is not set. Copy server/.env.example to server/.env.local and fill it in.');
  process.exit(1);
}

// firebase-admin skips signature checks when this is set; never run like that.
if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('[server] FIREBASE_AUTH_EMULATOR_HOST is set, which disables ID token signature checks. Unset it and restart.');
  process.exit(1);
}

// Verifying ID token signatures only needs the project ID (Google's public
// keys). A service account is optional and enables revocation checks.
initializeApp({
  projectId: FIREBASE_PROJECT_ID,
  ...(HAS_ADMIN_CREDENTIALS ? { credential: applicationDefault() } : {}),
});
const adminAuth = getAuth();

const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const NOT_OWNER_MESSAGE = 'Brightspace connection is available only to the configured local demo account.';
const NOT_PIAZZA_OWNER_MESSAGE = 'Piazza connection is available only to the configured local demo account.';

// ── HTTP helpers ────────────────────────────────────────────────────────────

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Status + safe, TrojanMind-authored error body for any thrown value. */
function describeError(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof HttpError || err instanceof AiRequestError) return { status: err.status, code: err.code, message: err.message };
  if (err instanceof ConnectorError) {
    const status = err.kind === 'timeout' ? 504 : err.kind === 'auth' ? 409 : 502;
    const code = err.authState ? `brightspace_${err.authState}` : `brightspace_${err.kind}`;
    return { status, code, message: err.message };
  }
  if (err instanceof PiazzaConnectorError) {
    const status = err.kind === 'pending' ? 202 : err.kind === 'auth' ? 409 : err.kind === 'launch' ? 503 : 502;
    return { status: status === 202 ? 409 : status, code: `piazza_${err.kind}`, message: err.message };
  }
  console.error('[server] unexpected error');
  return { status: 500, code: 'internal', message: 'Unexpected connector error.' };
}

function sendError(res: ServerResponse, err: unknown, origin?: string) {
  const { status, code, message } = describeError(err);
  return send(res, status, { error: { code, message } }, origin);
}

/** Read a JSON request body up to `limit` bytes. */
async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Expected a JSON body.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'body_too_large', 'Request body is too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

// ── Access control (runs before anything touches the connector) ─────────────

/** Verified Firebase UID of the caller. Identity comes only from the token. */
async function requireVerifiedUser(req: IncomingMessage): Promise<string> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  if (!match) throw new HttpError(401, 'missing_token', 'Sign in to TrojanMind first.');

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(match[1], HAS_ADMIN_CREDENTIALS);
  } catch {
    // Never echo the token or the verifier's detailed error.
    throw new HttpError(401, 'invalid_token', 'Your session could not be verified. Sign in again.');
  }
  if (decoded.email_verified !== true) {
    throw new HttpError(403, 'email_unverified', 'Verify your email before connecting to Brightspace.');
  }
  return decoded.uid;
}

/** True only for the one configured local demo owner. */
const isLocalOwner = (uid: string) => Boolean(OWNER_UID) && uid === OWNER_UID;

/** Which connection method applies to this UID. Decided here, never by the client. */
const methodFor = (uid: string): ConnectionMethod => (isLocalOwner(uid) ? 'local_demo' : 'individual');

async function requireOwner(req: IncomingMessage): Promise<string> {
  const uid = await requireVerifiedUser(req);
  // Identity comes only from the verified token, never from request input.
  if (!OWNER_UID) {
    throw new HttpError(503, 'connector_not_configured',
      'The local Brightspace connector has no owner configured. Set LOCAL_BRIGHTSPACE_OWNER_UID in server/.env.local and restart `npm run server`.');
  }
  if (uid !== OWNER_UID) throw new HttpError(403, 'not_owner', NOT_OWNER_MESSAGE);
  if (!EXPECTED_UNIQUE_NAME) {
    throw new HttpError(503, 'connector_not_configured',
      'The expected Brightspace account is not configured. Set LOCAL_BRIGHTSPACE_EXPECTED_UNIQUE_NAME in server/.env.local and restart `npm run server`.');
  }
  return uid;
}

/** True only for the configured Piazza local-demo owner (may differ from Brightspace). */
const isPiazzaOwner = (uid: string) => Boolean(PIAZZA_OWNER_UID) && uid === PIAZZA_OWNER_UID;

const piazzaMethodFor = (uid: string): ConnectionMethod => (isPiazzaOwner(uid) ? 'local_demo' : 'individual');

async function requirePiazzaOwner(req: IncomingMessage): Promise<string> {
  const uid = await requireVerifiedUser(req);
  if (!PIAZZA_OWNER_UID) {
    throw new HttpError(503, 'piazza_not_configured',
      'The local Piazza connector has no owner configured. Set LOCAL_PIAZZA_OWNER_UID in server/.env.local and restart `npm run server`.');
  }
  if (uid !== PIAZZA_OWNER_UID) throw new HttpError(403, 'not_piazza_owner', NOT_PIAZZA_OWNER_MESSAGE);
  return uid;
}

function setPiazzaState(uid: string, state: ConnectionState, errorCode: string | null = null) {
  setState(connections, uid, 'piazza', 'local_demo', state, errorCode);
}

function parsePiazzaClassId(segment: string): string {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(segment)) {
    throw new HttpError(400, 'invalid_piazza_class_id', 'That Piazza class ID isn’t valid.');
  }
  return segment;
}

// ── Per-user connection state ───────────────────────────────────────────────

const connections = new InMemoryConnectionStore();

function setLocalState(uid: string, state: ConnectionState, errorCode: string | null = null) {
  setState(connections, uid, 'brightspace', 'local_demo', state, errorCode);
}

/** Request failures that mean the connection itself is unusable. */
const CONNECTION_LEVEL_CODES = new Set(['brightspace_identity_unknown', 'brightspace_identity_mismatch', 'connector_not_configured']);

/**
 * Run a local-demo request and record the owner's resulting connection state.
 * A sign-in problem after a successful connection counts as `expired`.
 */
async function trackLocal<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const wasConnected = connections.get(uid, 'brightspace')?.state === 'connected';
    if (err instanceof ConnectorError && err.kind === 'auth') {
      if (err.authState === 'action_required' || err.authState === 'pending') {
        setLocalState(uid, wasConnected ? 'expired' : 'connecting', `brightspace_${err.authState}`);
      } else {
        setLocalState(uid, 'error', `brightspace_${err.authState ?? 'auth'}`);
      }
    } else if (err instanceof HttpError && CONNECTION_LEVEL_CODES.has(err.code)) {
      setLocalState(uid, 'error', err.code);
    } else if (err instanceof ConnectorError && (err.kind === 'launch' || err.kind === 'timeout')) {
      setLocalState(uid, 'error', `brightspace_${err.kind}`);
    }
    // Anything else (a missing course, one bad response) leaves the connection state as it was.
    throw err;
  }
}

const normalize = (s: string) => s.trim().toLowerCase();

/** Refuse unless the saved Brightspace session is the expected account. */
async function requireExpectedIdentity(): Promise<void> {
  const uniqueName = await getSignedInUniqueName();
  if (!uniqueName) {
    throw new HttpError(409, 'brightspace_identity_unknown',
      'The Brightspace account on this computer could not be confirmed, so no course data was returned. Try connecting again.');
  }
  if (normalize(uniqueName) !== normalize(EXPECTED_UNIQUE_NAME ?? '')) {
    // Neither value is echoed back.
    throw new HttpError(403, 'brightspace_identity_mismatch',
      'The Brightspace account signed in on this computer does not match LOCAL_BRIGHTSPACE_EXPECTED_UNIQUE_NAME. No course data was returned.');
  }
}

/** Check identity before and after reading, so data from any other account is never returned. */
async function loadVerifiedCourses(): Promise<BrightspaceCourse[]> {
  await requireExpectedIdentity();
  const courses = await getMyCourses();
  await requireExpectedIdentity();
  return courses;
}

/** Strict positive integer course ID from a path segment. */
function parseCourseId(segment: string): number {
  if (!/^[1-9]\d{0,14}$/.test(segment)) throw new HttpError(400, 'invalid_course_id', 'That course ID isn’t valid.');
  const id = Number(segment);
  if (!Number.isSafeInteger(id)) throw new HttpError(400, 'invalid_course_id', 'That course ID isn’t valid.');
  return id;
}

/**
 * Content for one course, only if it's among the verified user's accessible
 * courses. Identity is re-checked after reading, as for the course list.
 */
async function loadVerifiedCourseContent(courseId: number): Promise<{ course: BrightspaceCourse; content: CourseContent }> {
  const courses = await loadVerifiedCourses();
  const course = courses.find((c) => c.id === courseId);
  if (!course) {
    throw new HttpError(404, 'course_not_found', 'This course isn’t in your Brightspace course list, so its content wasn’t requested.');
  }
  if (course.canAccess === false) {
    throw new HttpError(403, 'course_no_access', 'Brightspace reports this course isn’t accessible to your account right now.');
  }
  const origin = await getBrightspaceOrigin();
  const content = await getCourseContent(courseId, origin);
  await requireExpectedIdentity();
  return { course, content };
}

/** Same checks as loadVerifiedCourseContent, plus the topic index and page bodies used for import. */
async function loadVerifiedImportIndex(courseId: number) {
  const courses = await loadVerifiedCourses();
  const course = courses.find((c) => c.id === courseId);
  if (!course) {
    throw new HttpError(404, 'course_not_found', 'This course isn’t in your Brightspace course list, so nothing was imported.');
  }
  if (course.canAccess === false) {
    throw new HttpError(403, 'course_no_access', 'Brightspace reports this course isn’t accessible to your account right now.');
  }
  const origin = await getBrightspaceOrigin();
  const { content, inlineHtml } = await getCourseContentForImport(courseId, origin);
  await requireExpectedIdentity();
  return { course, topics: indexTopics(content), inlineHtml };
}

/** UIDs with an import running: repeated clicks or tabs never start a second one. */
const importsInFlight = new Set<string>();

// ── Connect flow (single-flight) ────────────────────────────────────────────

type ConnectResult =
  | { state: 'connected'; courses: BrightspaceCourse[]; retrievedAt: string }
  | { state: AuthState; message: string };

let connectInFlight: Promise<ConnectResult> | null = null;

/**
 * sign_in (a no-op when the saved session is valid), then identity-checked
 * course loading. Concurrent requests (refreshes, double clicks) join the one
 * in flight instead of starting another sign-in.
 */
function connectAndLoad(): Promise<ConnectResult> {
  if (connectInFlight) return connectInFlight;
  connectInFlight = (async (): Promise<ConnectResult> => {
    const outcome = await signIn();
    if (outcome.state !== 'connected') return outcome;
    const courses = await loadVerifiedCourses();
    return { state: 'connected', courses, retrievedAt: new Date().toISOString() };
  })().finally(() => {
    connectInFlight = null;
  });
  return connectInFlight;
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

  // Defense in depth for a localhost service: loopback peers only, expected
  // Host header (blocks DNS rebinding), known browser origins only.
  const remote = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
    return sendError(res, new HttpError(403, 'forbidden', 'Local connections only.'));
  }
  if (!ALLOWED_HOSTS.has(req.headers.host ?? '')) return sendError(res, new HttpError(403, 'forbidden', 'Unexpected host.'));
  if (origin && !ALLOWED_ORIGINS.has(origin)) return sendError(res, new HttpError(403, 'forbidden', 'Origin not allowed.'));

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true }, origin);
    }

    // Sign in if needed, then load courses. Used automatically after login.
    // The caller's own connection(s). Any verified user; never another UID's data.
    if (req.method === 'GET' && url.pathname === '/connections') {
      const uid = await requireVerifiedUser(req);
      return send(res, 200, {
        connections: [
          describeConnection(connections, uid, 'brightspace', methodFor(uid)),
          describeConnection(connections, uid, 'piazza', piazzaMethodFor(uid)),
        ],
      }, origin);
    }

    // Individual connections need a registered Brightspace OAuth app. Refuse
    // clearly instead of starting anything (and never the local connector).
    if (req.method === 'POST' && url.pathname === '/connections/brightspace/start') {
      const uid = await requireVerifiedUser(req);
      if (isLocalOwner(uid)) {
        throw new HttpError(400, 'use_local_demo', 'This account uses the local demo connection. Use “Connect to Brightspace” on My Courses.');
      }
      throw new HttpError(501, 'individual_oauth_not_configured',
        'Individual Brightspace connections aren’t available yet. TrojanMind doesn’t have an approved Brightspace integration.');
    }

    if (req.method === 'POST' && url.pathname === '/brightspace/connect') {
      const uid = await requireOwner(req);
      setLocalState(uid, 'connecting');
      let result: ConnectResult;
      try {
        result = await trackLocal(uid, connectAndLoad);
      } catch (err) {
        // Never leave a failed attempt looking like it's still in progress.
        const now = connections.get(uid, 'brightspace');
        if (now?.state === 'connecting' && !now.errorCode) setLocalState(uid, 'error', 'brightspace_connect_failed');
        throw err;
      }
      if (result.state === 'connected') setLocalState(uid, 'connected');
      else if (result.state === 'action_required' || result.state === 'pending') setLocalState(uid, 'connecting', `brightspace_${result.state}`);
      else setLocalState(uid, 'error', `brightspace_${result.state}`);
      return send(res, 200, result, origin);
    }

    // Courses from the existing session. Doesn't call sign_in (the connector may
    // still renew an expired session on its own, as it does for any tool call).
    if (req.method === 'GET' && url.pathname === '/brightspace/courses') {
      const uid = await requireOwner(req);
      const courses = await trackLocal(uid, loadVerifiedCourses);
      setLocalState(uid, 'connected');
      return send(res, 200, { courses, retrievedAt: new Date().toISOString() }, origin);
    }

    // Exams, quizzes and other dated items for the next 90 days, across all courses.
    if (req.method === 'GET' && url.pathname === '/brightspace/upcoming') {
      const uid = await requireOwner(req);
      const dates = await trackLocal(uid, async () => {
        await requireExpectedIdentity();
        const items = await getUpcomingDates(await getBrightspaceOrigin());
        await requireExpectedIdentity();
        return items;
      });
      return send(res, 200, { dates, retrievedAt: new Date().toISOString() }, origin);
    }

    // Official USC final exam slots for the user's current-term courses.
    if (req.method === 'GET' && url.pathname === '/brightspace/official-finals') {
      const uid = await requireOwner(req);
      const courses = await trackLocal(uid, loadVerifiedCourses);
      const results = await Promise.all(courses.filter((c) => c.canAccess !== false).map(officialFinalFor));
      const finals = results.filter((f): f is OfficialFinal => f !== null);
      const sources = supportedTerms().map(finalsSourceFor).filter((s) => s !== null);
      return send(res, 200, { finals, sources, retrievedAt: new Date().toISOString() }, origin);
    }

    // Module/topic tree for one of the user's accessible courses.
    const contentMatch = /^\/brightspace\/courses\/([^/]+)\/content$/.exec(url.pathname);
    if (req.method === 'GET' && contentMatch) {
      const uid = await requireOwner(req);
      const courseId = parseCourseId(contentMatch[1]);
      const { course, content } = await trackLocal(uid, () => loadVerifiedCourseContent(courseId));
      return send(res, 200, {
        course: { id: course.id, name: course.name, code: course.code },
        ...content,
        retrievedAt: new Date().toISOString(),
      }, origin);
    }

    // Import the selected items' readable text. Streams one NDJSON line per item.
    const importMatch = /^\/brightspace\/courses\/([^/]+)\/import$/.exec(url.pathname);
    if (req.method === 'POST' && importMatch) {
      const uid = await requireOwner(req);
      const courseId = parseCourseId(importMatch[1]);
      const keys = parseImportKeys(await readJsonBody(req, 64 * 1024));
      if (!keys) throw new HttpError(400, 'invalid_selection', `Select between 1 and ${MAX_IMPORT_ITEMS} items to import.`);
      if (importsInFlight.has(uid)) throw new HttpError(409, 'import_in_progress', 'An import is already running. Wait for it to finish.');
      importsInFlight.add(uid);
      try {
        // All access checks happen before any response is started.
        const { course, topics, inlineHtml } = await trackLocal(uid, () => loadVerifiedImportIndex(courseId));
        let clientGone = false;
        res.on('close', () => { if (!res.writableFinished) clientGone = true; });
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
        });
        const line = (o: unknown) => res.write(`${JSON.stringify(o)}\n`);
        line({ type: 'start', course: { id: course.id, name: course.name, code: course.code }, total: keys.length });
        let stopped = false;
        for (let i = 0; i < keys.length && !clientGone; i++) {
          try {
            // Re-confirm the Brightspace account before each retrieval.
            await requireExpectedIdentity();
            line({ type: 'item', item: await trackLocal(uid, () => importOne(courseId, i, keys[i], topics, inlineHtml)) });
          } catch (err) {
            const { code, message } = describeError(err);
            line({ type: 'error', code, message, completed: i });
            stopped = true;
            break;
          }
        }
        if (!stopped && !clientGone) line({ type: 'done', retrievedAt: new Date().toISOString() });
        res.end();
        return;
      } finally {
        importsInFlight.delete(uid);
      }
    }

    // Claude proxy for every TrojanMind AI feature. Any verified user; key stays here.
    if (req.method === 'POST' && url.pathname === '/ai/messages') {
      await requireVerifiedUser(req);
      const body = sanitizeAiBody(await readJsonBody(req, 4 * 1024 * 1024));
      const upstream = await forwardToAnthropic(body);
      res.writeHead(upstream.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      });
      res.end(upstream.text);
      return;
    }

    // ── Piazza (owner-only local demo) ─────────────────────────────────────

    if (req.method === 'POST' && url.pathname === '/piazza/connect') {
      const uid = await requirePiazzaOwner(req);
      setPiazzaState(uid, 'connecting');
      try {
        const body = await readJsonBody(req, 4 * 1024).catch(() => ({}));
        const force = !!(body && typeof body === 'object' && (body as { force?: unknown }).force === true);
        const result = await connectPiazza(force);
        setPiazzaState(uid, 'connected');
        return send(res, 200, { state: 'connected', ...result }, origin);
      } catch (err) {
        if (err instanceof PiazzaConnectorError && err.kind === 'pending') {
          setPiazzaState(uid, 'connecting', 'piazza_pending');
          return send(res, 200, { state: 'pending', message: err.message }, origin);
        }
        if (err instanceof PiazzaConnectorError && err.kind === 'auth') {
          setPiazzaState(uid, 'expired', 'piazza_auth');
        } else {
          setPiazzaState(uid, 'error', err instanceof PiazzaConnectorError ? `piazza_${err.kind}` : 'piazza_connect_failed');
        }
        throw err;
      }
    }

    if (req.method === 'GET' && url.pathname === '/piazza/classes') {
      const uid = await requirePiazzaOwner(req);
      try {
        const classes = await listClasses(url.searchParams.get('includeInactive') === '1');
        setPiazzaState(uid, 'connected');
        return send(res, 200, { classes, retrievedAt: new Date().toISOString() }, origin);
      } catch (err) {
        if (err instanceof PiazzaConnectorError && (err.kind === 'auth' || err.kind === 'pending')) {
          setPiazzaState(uid, err.kind === 'pending' ? 'connecting' : 'expired', `piazza_${err.kind}`);
        }
        throw err;
      }
    }

    const piazzaPostsMatch = /^\/piazza\/classes\/([^/]+)\/posts$/.exec(url.pathname);
    if (req.method === 'GET' && piazzaPostsMatch) {
      const uid = await requirePiazzaOwner(req);
      const classId = parsePiazzaClassId(piazzaPostsMatch[1]);
      const q = url.searchParams.get('q')?.trim() || '';
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 30) || 30));
      const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
      try {
        if (q) {
          const posts = await searchPosts(classId, q, limit);
          setPiazzaState(uid, 'connected');
          return send(res, 200, {
            posts,
            coverageNote: `Search results for “${q.slice(0, 80)}” (authorized Piazza search; not a full archive dump).`,
            retrievedAt: new Date().toISOString(),
          }, origin);
        }
        const { posts, coverageNote } = await listRecentPosts(classId, limit, offset);
        setPiazzaState(uid, 'connected');
        return send(res, 200, { posts, coverageNote, retrievedAt: new Date().toISOString() }, origin);
      } catch (err) {
        if (err instanceof PiazzaConnectorError && (err.kind === 'auth' || err.kind === 'pending')) {
          setPiazzaState(uid, err.kind === 'pending' ? 'connecting' : 'expired', `piazza_${err.kind}`);
        }
        throw err;
      }
    }

    const piazzaReadMatch = /^\/piazza\/classes\/([^/]+)\/read$/.exec(url.pathname);
    if (req.method === 'POST' && piazzaReadMatch) {
      const uid = await requirePiazzaOwner(req);
      const classId = parsePiazzaClassId(piazzaReadMatch[1]);
      const body = await readJsonBody(req, 16 * 1024);
      const refsRaw = body && typeof body === 'object' ? (body as { posts?: unknown }).posts : null;
      if (!Array.isArray(refsRaw) || refsRaw.length < 1 || refsRaw.length > 30) {
        throw new HttpError(400, 'invalid_posts', 'Provide 1–30 post numbers to read.');
      }
      const refs = refsRaw.map((r) => String(r));
      try {
        const posts = await readPosts(classId, refs);
        setPiazzaState(uid, 'connected');
        return send(res, 200, {
          posts: posts.map((p) => ({ ...p, url: safePiazzaUrl(p.url, classId) })),
          retrievedAt: new Date().toISOString(),
        }, origin);
      } catch (err) {
        if (err instanceof PiazzaConnectorError && (err.kind === 'auth' || err.kind === 'pending')) {
          setPiazzaState(uid, err.kind === 'pending' ? 'connecting' : 'expired', `piazza_${err.kind}`);
        }
        throw err;
      }
    }

    return sendError(res, new HttpError(404, 'not_found', 'Not found.'), origin);
  } catch (err) {
    return sendError(res, err, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] TrojanMind local connector on http://${HOST}:${PORT} (loopback only)`);
  console.log(`[server] Revocation checks: ${HAS_ADMIN_CREDENTIALS ? 'on' : 'off (no service account)'}`);
  if (!OWNER_UID) console.warn('[server] LOCAL_BRIGHTSPACE_OWNER_UID is not set: every Brightspace request will be refused.');
  if (!EXPECTED_UNIQUE_NAME) console.warn('[server] LOCAL_BRIGHTSPACE_EXPECTED_UNIQUE_NAME is not set: every Brightspace request will be refused.');
  if (!aiConfigured()) console.warn('[server] ANTHROPIC_API_KEY is not set: AI features will return ai_not_configured.');
});

const shutdown = () => {
  void Promise.all([closeConnector(), closePiazzaConnector()]).finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
