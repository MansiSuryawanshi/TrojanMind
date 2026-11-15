import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '../auth/useAuth';
import { BrightspaceContext, NOT_OWNER_MESSAGE, type BrightspaceStatus, type Course } from './brightspaceContext';

// Proxied by the Vite dev server to the localhost-only connector (server/index.ts).
const CONNECT_ENDPOINT = '/local-api/brightspace/connect';

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

const Inner: React.FC<{ user: User; children: React.ReactNode }> = ({ user, children }) => {
  const [status, setStatus] = useState<BrightspaceStatus>({ kind: 'idle' });
  // The one attempt currently running, if any.
  const activeRef = useRef<AbortController | null>(null);
  // Read through a ref so `connect` stays stable: a Firebase token refresh
  // must never re-trigger the automatic attempt below.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const connect = useCallback(() => {
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
        const json = (res.headers.get('content-type') ?? '').includes('application/json')
          ? await res.json().catch(() => null)
          : null;
        next = toStatus(res, json);
      } catch {
        next = { kind: 'error', code: 'unreachable', message: '' };
      } finally {
        if (activeRef.current === controller) activeRef.current = null;
      }
      // Signed out / unmounted meanwhile: drop the result.
      if (!controller.signal.aborted) setStatus(next);
    })();
  }, []);

  // Exactly one automatic attempt per login (per mount of this provider).
  // No automatic retries. The server joins concurrent requests into one sign-in,
  // so StrictMode's dev-only remount can't start a second one either.
  useEffect(() => {
    connect();
    return () => {
      activeRef.current?.abort();
      activeRef.current = null;
    };
  }, [connect]);

  const value = useMemo(() => ({ status, connect }), [status, connect]);
  return <BrightspaceContext.Provider value={value}>{children}</BrightspaceContext.Provider>;
};

const SIGNED_OUT_VALUE = { status: { kind: 'idle' } as BrightspaceStatus, connect: () => undefined };

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
