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
  PORT,
} from './config.ts';
import {
  ConnectorError,
  closeConnector,
  getBrightspaceOrigin,
  getCourseContent,
  getMyCourses,
  getSignedInUniqueName,
  signIn,
  type AuthState,
  type BrightspaceCourse,
  type CourseContent,
} from './brightspaceMcp.ts';

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

function sendError(res: ServerResponse, err: unknown, origin?: string) {
  if (err instanceof HttpError) {
    return send(res, err.status, { error: { code: err.code, message: err.message } }, origin);
  }
  if (err instanceof ConnectorError) {
    const status = err.kind === 'timeout' ? 504 : err.kind === 'auth' ? 409 : 502;
    const code = err.authState ? `brightspace_${err.authState}` : `brightspace_${err.kind}`;
    return send(res, status, { error: { code, message: err.message } }, origin);
  }
  console.error('[server] unexpected error');
  return send(res, 500, { error: { code: 'internal', message: 'Unexpected connector error.' } }, origin);
}

// ── Access control (runs before anything touches the connector) ─────────────

async function requireOwner(req: IncomingMessage): Promise<void> {
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
  // Identity comes only from the verified token, never from request input.
  if (!OWNER_UID) {
    throw new HttpError(503, 'connector_not_configured',
      'The local Brightspace connector has no owner configured. Set LOCAL_BRIGHTSPACE_OWNER_UID in server/.env.local and restart `npm run server`.');
  }
  if (decoded.uid !== OWNER_UID) throw new HttpError(403, 'not_owner', NOT_OWNER_MESSAGE);
  if (!EXPECTED_UNIQUE_NAME) {
    throw new HttpError(503, 'connector_not_configured',
      'The expected Brightspace account is not configured. Set LOCAL_BRIGHTSPACE_EXPECTED_UNIQUE_NAME in server/.env.local and restart `npm run server`.');
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
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true }, origin);
    }

    // Sign in if needed, then load courses. Used automatically after login.
    if (req.method === 'POST' && url.pathname === '/brightspace/connect') {
      await requireOwner(req);
      return send(res, 200, await connectAndLoad(), origin);
    }

    // Courses from the existing session. Doesn't call sign_in (the connector may
    // still renew an expired session on its own, as it does for any tool call).
    if (req.method === 'GET' && url.pathname === '/brightspace/courses') {
      await requireOwner(req);
      const courses = await loadVerifiedCourses();
      return send(res, 200, { courses, retrievedAt: new Date().toISOString() }, origin);
    }

    // Module/topic tree for one of the user's accessible courses.
    const contentMatch = /^\/brightspace\/courses\/([^/]+)\/content$/.exec(url.pathname);
    if (req.method === 'GET' && contentMatch) {
      await requireOwner(req);
      const courseId = parseCourseId(contentMatch[1]);
      const { course, content } = await loadVerifiedCourseContent(courseId);
      return send(res, 200, {
        course: { id: course.id, name: course.name, code: course.code },
        ...content,
        retrievedAt: new Date().toISOString(),
      }, origin);
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
});

const shutdown = () => {
  void closeConnector().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
