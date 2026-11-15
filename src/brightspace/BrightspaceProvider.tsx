import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '../auth/useAuth';
import {
  BrightspaceContext,
  NOT_OWNER_MESSAGE,
  type BrightspaceConnection,
  type BrightspaceContextValue,
  type ConnectionMethod,
  type ConnectionState,
  type BrightspaceStatus,
  type Course,
  type CourseContentResult,
  type CourseSelection,
  type ImportEvent,
  type SelectedMaterial,
  type OfficialFinalsResult,
  type UpcomingDatesResult,
  type UsedMaterials,
} from './brightspaceContext';
import {
  OFFICIAL_FINALS_ENDPOINT,
  UPCOMING_DATES_ENDPOINT,
  courseContentEndpoint,
  courseImportEndpoint,
  toCourseContent,
  toImportEvent,
  toOfficialFinals,
  toUpcomingDates,
} from './contentApi';

const UNREACHABLE = 'The local connector isn’t reachable. Start it with `npm run server`.';

/** GET a connector JSON endpoint; returns the parsed body or a failure in UI terms. */
async function getConnectorJson(
  user: User,
  endpoint: string,
  signal: AbortSignal | undefined,
  staleMessage: string,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; code: string; message: string }> {
  let res: Response;
  let json: unknown = null;
  try {
    const token = await user.getIdToken();
    res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal });
    json = await readJson(res);
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, code: 'unreachable', message: UNREACHABLE };
  }
  if (!json || typeof json !== 'object') return { ok: false, code: 'unreachable', message: UNREACHABLE };
  if (res.ok) return { ok: true, json: json as Record<string, unknown> };
  const err = ((json as Record<string, unknown>).error ?? {}) as Record<string, unknown>;
  const code = asString(err.code, `http_${res.status}`);
  const message = code === 'not_owner' ? NOT_OWNER_MESSAGE
    : code === 'not_found' ? staleMessage
    : asString(err.message, 'The connector returned an error.');
  return { ok: false, code, message };
}

// Proxied by the Vite dev server to the localhost-only connector (server/index.ts).
const CONNECT_ENDPOINT = '/local-api/brightspace/connect';
const CONNECTIONS_ENDPOINT = '/local-api/connections';

type Resolution =
  | { kind: 'resolved'; method: ConnectionMethod; available: boolean }
  | { kind: 'failed'; code: string; message: string };

async function readJson(res: Response): Promise<unknown> {
  return (res.headers.get('content-type') ?? '').includes('application/json') ? res.json().catch(() => null) : null;
}

/** Collapse the detailed local-demo status into the provider-independent state. */
function localDemoState(status: BrightspaceStatus, wasConnected: boolean): ConnectionState {
  switch (status.kind) {
    case 'idle':
      return 'not_connected';
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'action_required':
    case 'pending':
      // Sign-in needed again after this session had connected: the session expired.
      return wasConnected ? 'expired' : 'connecting';
    case 'error':
      return 'error';
  }
}

function isCourse(v: unknown): v is Course {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return typeof c.id === 'number' && typeof c.name === 'string';
}

const asString = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);

/** Turn a connector response into UI state. Only server-authored fields are read. */
function toStatus(res: Response, body: unknown): BrightspaceStatus {
  if (!body || typeof body !== 'object') {
    // Proxy error page / deployed site: the local connector isn't reachable.
    return { kind: 'error', code: 'unreachable', message: '' };
  }
  const b = body as Record<string, unknown>;

  if (res.ok) {
    switch (b.state) {
      case 'connected':
        if (!Array.isArray(b.courses)) break;
        return {
          kind: 'connected',
          courses: b.courses.filter(isCourse),
          retrievedAt: asString(b.retrievedAt, new Date().toISOString()),
        };
      case 'action_required':
      case 'pending':
        return { kind: b.state, message: asString(b.message, 'Brightspace sign-in needs attention.') };
      case 'failed':
      case 'config':
        return { kind: 'error', code: `brightspace_${b.state}`, message: asString(b.message, 'Brightspace sign-in failed.') };
    }
    return { kind: 'error', code: 'bad_response', message: 'The connector returned data in an unexpected format.' };
  }

  const err = (b.error ?? {}) as Record<string, unknown>;
  const code = asString(err.code, `http_${res.status}`);
  const message = asString(err.message, 'The connector returned an error.');
  if (code === 'not_owner') return { kind: 'error', code, message: NOT_OWNER_MESSAGE };
  if (code === 'brightspace_action_required') return { kind: 'action_required', message };
  if (code === 'brightspace_pending') return { kind: 'pending', message };
  return { kind: 'error', code, message };
}

/** Read the caller's own Brightspace entry from GET /connections. */
function toResolution(res: Response, body: unknown): Resolution {
  if (!body || typeof body !== 'object') return { kind: 'failed', code: 'unreachable', message: '' };
  const b = body as Record<string, unknown>;
  if (!res.ok) {
    const err = (b.error ?? {}) as Record<string, unknown>;
    return { kind: 'failed', code: asString(err.code, `http_${res.status}`), message: asString(err.message, 'The connector returned an error.') };
  }
  const entry = Array.isArray(b.connections)
    ? (b.connections as unknown[]).find(
        (c): c is Record<string, unknown> => !!c && typeof c === 'object' && (c as Record<string, unknown>).provider === 'brightspace',
      )
    : undefined;
  if (entry && (entry.method === 'local_demo' || entry.method === 'individual')) {
    // Only the server may say a method is available; individual is never available in this build.
    return { kind: 'resolved', method: entry.method, available: entry.method === 'local_demo' && entry.available === true };
  }
  return { kind: 'failed', code: 'bad_response', message: 'The connector returned connection data in an unexpected format.' };
}

const Inner: React.FC<{ user: User; children: React.ReactNode }> = ({ user, children }) => {
  const [status, setStatus] = useState<BrightspaceStatus>({ kind: 'idle' });
  // Which connection method the server says applies to this UID (null = not known yet).
  const [method, setMethod] = useState<ConnectionMethod | null>(null);
  const [available, setAvailable] = useState(false);
  const [resolving, setResolving] = useState(true);
  const methodRef = useRef<ConnectionMethod | null>(null);
  const [wasConnected, setWasConnected] = useState(false);
  // The one attempt currently running, if any.
  const activeRef = useRef<AbortController | null>(null);
  // Read through a ref so `connect` stays stable: a Firebase token refresh
  // must never re-trigger the automatic attempt below.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const applyMethod = useCallback((m: ConnectionMethod | null, isAvailable: boolean) => {
    methodRef.current = m;
    setMethod(m);
    setAvailable(isAvailable);
  }, []);

  /** One local-demo connect attempt. Only ever runs for the server-confirmed owner. */
  const startLocal = useCallback(() => {
    // Only the configured local demo owner may use the local connector. Everyone
    // else needs an individual connection, which isn't available yet.
    if (methodRef.current !== 'local_demo') return;
    if (activeRef.current) return; // repeated clicks / rerenders never start a second attempt
    const controller = new AbortController();
    activeRef.current = controller;
    setStatus({ kind: 'connecting' });

    void (async () => {
      let next: BrightspaceStatus;
      try {
        const token = await userRef.current.getIdToken();
        const res = await fetch(CONNECT_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        next = toStatus(res, await readJson(res));
      } catch {
        next = { kind: 'error', code: 'unreachable', message: '' };
      } finally {
        if (activeRef.current === controller) activeRef.current = null;
      }
      // Signed out / unmounted meanwhile: drop the result.
      if (controller.signal.aborted) return;
      if (next.kind === 'error' && next.code === 'not_owner') {
        // Owner config changed under us: this UID is not the local demo owner.
        applyMethod('individual', false);
        setStatus({ kind: 'idle' });
        return;
      }
      if (next.kind === 'connected') setWasConnected(true);
      setStatus(next);
    })();
  }, [applyMethod]);

  const resolveRef = useRef<AbortController | null>(null);

  /**
   * Ask the server which method applies to this UID, then make one automatic
   * attempt only if it's the local demo owner.
   */
  const resolve = useCallback(() => {
    if (resolveRef.current) return;
    const controller = new AbortController();
    resolveRef.current = controller;
    setResolving(true);
    void (async () => {
      let resolution: Resolution;
      try {
        const token = await userRef.current.getIdToken();
        const res = await fetch(CONNECTIONS_ENDPOINT, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        resolution = toResolution(res, await readJson(res));
      } catch {
        resolution = { kind: 'failed', code: 'unreachable', message: '' };
      } finally {
        if (resolveRef.current === controller) resolveRef.current = null;
      }
      if (controller.signal.aborted) return;
      setResolving(false);
      if (resolution.kind === 'failed') {
        applyMethod(null, false);
        setStatus({ kind: 'error', code: resolution.code, message: resolution.message });
        return;
      }
      applyMethod(resolution.method, resolution.available);
      setStatus({ kind: 'idle' });
      if (resolution.method === 'local_demo' && resolution.available) startLocal();
    })();
  }, [startLocal, applyMethod]);

  /** Public “connect / try again”: re-resolve if the method isn't known yet. */
  const connect = useCallback(() => {
    if (methodRef.current === null) resolve();
    else startLocal();
  }, [resolve, startLocal]);

  // Once per login (per mount of this provider). No automatic retries. The
  // server joins concurrent connects into one sign-in, so StrictMode's dev-only
  // remount is harmless.
  useEffect(() => {
    resolve();
    return () => {
      resolveRef.current?.abort();
      resolveRef.current = null;
      activeRef.current?.abort();
      activeRef.current = null;
    };
  }, [resolve]);

  const fetchCourseContent = useCallback(async (courseId: number, signal?: AbortSignal): Promise<CourseContentResult> => {
    let res: Response;
    let json: unknown = null;
    try {
      const token = await userRef.current.getIdToken();
      res = await fetch(courseContentEndpoint(courseId), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal,
      });
      json = await readJson(res);
    } catch (err) {
      if (signal?.aborted) throw err;
      return { ok: false, kind: 'error', code: 'unreachable', message: '' };
    }
    if (!json || typeof json !== 'object') return { ok: false, kind: 'error', code: 'unreachable', message: '' };
    if (res.ok) {
      const content = toCourseContent(json, courseId);
      return content
        ? { ok: true, content }
        : { ok: false, kind: 'error', code: 'bad_response', message: 'The connector returned course content in an unexpected format.' };
    }
    const err = ((json as Record<string, unknown>).error ?? {}) as Record<string, unknown>;
    const code = asString(err.code, `http_${res.status}`);
    const message = code === 'not_owner' ? NOT_OWNER_MESSAGE : asString(err.message, 'The connector returned an error.');
    if (code === 'brightspace_action_required') return { ok: false, kind: 'action_required', code, message };
    if (code === 'brightspace_pending') return { ok: false, kind: 'pending', code, message };
    return { ok: false, kind: 'error', code, message };
  }, []);

  const fetchUpcomingDates = useCallback(async (signal?: AbortSignal): Promise<UpcomingDatesResult> => {
    const r = await getConnectorJson(userRef.current, UPCOMING_DATES_ENDPOINT, signal, 'The running connector predates Brightspace dates. Restart `npm run server`.');
    if (!r.ok) return r;
    const dates = toUpcomingDates(r.json);
    return dates
      ? { ok: true, dates, retrievedAt: asString(r.json.retrievedAt, new Date().toISOString()) }
      : { ok: false, code: 'bad_response', message: 'The connector returned dates in an unexpected format.' };
  }, []);

  const fetchOfficialFinals = useCallback(async (signal?: AbortSignal): Promise<OfficialFinalsResult> => {
    const r = await getConnectorJson(userRef.current, OFFICIAL_FINALS_ENDPOINT, signal, 'The running connector predates official finals. Restart `npm run server`.');
    if (!r.ok) return r;
    const parsed = toOfficialFinals(r.json);
    return parsed
      ? { ok: true, ...parsed }
      : { ok: false, code: 'bad_response', message: 'The connector returned final exam data in an unexpected format.' };
  }, []);

  /**
   * Stream an import from the connector. Errors before the stream starts
   * (access, identity, busy) arrive as a single `error` event.
   */
  const importMaterials = useCallback(async (courseId: number, keys: string[], onEvent: (e: ImportEvent) => void | Promise<void>) => {
    let res: Response;
    try {
      const token = await userRef.current.getIdToken();
      res = await fetch(courseImportEndpoint(courseId), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
        cache: 'no-store',
      });
    } catch {
      await onEvent({ type: 'error', code: 'unreachable', message: 'The local connector isn’t reachable. Start it with `npm run server`.' });
      return;
    }
    if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('application/x-ndjson')) {
      const json = await readJson(res);
      const err = ((json as Record<string, unknown> | null)?.error ?? {}) as Record<string, unknown>;
      const code = json ? asString(err.code, `http_${res.status}`) : 'unreachable';
      const message = code === 'not_owner' ? NOT_OWNER_MESSAGE
        : code === 'unreachable' ? 'The local connector isn’t reachable. Start it with `npm run server`.'
        : code === 'not_found' ? 'The running connector predates material import. Restart `npm run server`.'
        : asString(err.message, 'The import couldn’t start.');
      await onEvent({ type: 'error', code, message });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let ended = false;
    const handle = async (line: string) => {
      if (!line.trim()) return;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { return; }
      const ev = toImportEvent(parsed);
      if (!ev) return;
      if (ev.type === 'done' || ev.type === 'error') ended = true;
      await onEvent(ev);
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          await handle(line);
        }
      }
      await handle(buf + decoder.decode());
    } catch {
      /* connection dropped: reported below */
    }
    if (!ended) await onEvent({ type: 'error', code: 'stream_interrupted', message: 'The connection to the local connector was interrupted.' });
  }, []);

  // Selections live only in memory inside this per-UID provider: separate per
  // course, and discarded on logout or account switch (the provider unmounts).
  const [selections, setSelections] = useState<Record<number, CourseSelection>>({});
  const [usedMaterials, setUsedMaterials] = useState<Record<number, UsedMaterials>>({});

  const setCourseSelection = useCallback((courseId: number, update: (prev: CourseSelection) => CourseSelection) => {
    setSelections((all) => ({ ...all, [courseId]: update(all[courseId] ?? {}) }));
  }, []);

  const saveUsedMaterials = useCallback((courseId: number, items: SelectedMaterial[]) => {
    setUsedMaterials((all) => ({ ...all, [courseId]: { courseId, items, savedAt: new Date().toISOString() } }));
  }, []);

  const connection = useMemo<BrightspaceConnection>(() => {
    if (method === 'local_demo') return { method, state: localDemoState(status, wasConnected), available, resolving };
    // Individual connections can't be started in this build, so they're never connected.
    if (method === 'individual') return { method, state: 'not_connected', available: false, resolving };
    return { method: null, state: resolving ? 'connecting' : status.kind === 'error' ? 'error' : 'not_connected', available: false, resolving };
  }, [method, status, wasConnected, available, resolving]);

  const value = useMemo<BrightspaceContextValue>(
    () => ({ connection, status, connect, fetchCourseContent, fetchUpcomingDates, fetchOfficialFinals, selections, setCourseSelection, usedMaterials, saveUsedMaterials, importMaterials }),
    [connection, status, connect, fetchCourseContent, fetchUpcomingDates, fetchOfficialFinals, selections, setCourseSelection, usedMaterials, saveUsedMaterials, importMaterials],
  );
  return <BrightspaceContext.Provider value={value}>{children}</BrightspaceContext.Provider>;
};

const SIGNED_OUT_VALUE: BrightspaceContextValue = {
  connection: { method: null, state: 'not_connected', available: false, resolving: false },
  status: { kind: 'idle' },
  connect: () => undefined,
  fetchCourseContent: async () => ({ ok: false, kind: 'error', code: 'signed_out', message: 'Sign in to TrojanMind first.' }),
  fetchUpcomingDates: async () => ({ ok: false, code: 'signed_out', message: 'Sign in to TrojanMind first.' }),
  fetchOfficialFinals: async () => ({ ok: false, code: 'signed_out', message: 'Sign in to TrojanMind first.' }),
  selections: {},
  setCourseSelection: () => undefined,
  usedMaterials: {},
  saveUsedMaterials: () => undefined,
  importMaterials: async (_c, _k, onEvent) => { await onEvent({ type: 'error', code: 'signed_out', message: 'Sign in to TrojanMind first.' }); },
};

/**
 * Brightspace connection state for the signed-in user. Mounted inside
 * AuthGate, so it exists only for a verified user and is discarded on
 * logout; keyed by UID so state can never carry over between accounts.
 */
export const BrightspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <BrightspaceContext.Provider value={SIGNED_OUT_VALUE}>{children}</BrightspaceContext.Provider>;
  return (
    <Inner key={user.uid} user={user}>
      {children}
    </Inner>
  );
};
