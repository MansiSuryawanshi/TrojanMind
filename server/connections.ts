/**
 * Provider-independent model for "this TrojanMind user's connection to an
 * external learning system", keyed by the verified Firebase UID.
 *
 * Preparation step only:
 *  - The one working method is the owner-only local demo connector.
 *  - Individual (per-user) connections are modelled but NOT available: no OAuth
 *    client is registered, so there are no credentials, endpoints, or redirect
 *    flow here, and nothing ever reports such a connection as connected.
 *  - No credentials of any kind are stored in these records. A future OAuth step
 *    must keep tokens server-side (encrypted, keyed by UID) and never put them
 *    in a PublicConnection.
 */

export type ConnectionProvider = 'brightspace' | 'piazza';

export type ConnectionState = 'not_connected' | 'connecting' | 'connected' | 'expired' | 'error';

/**
 * local_demo – the developer's own LMS/Piazza session on this computer,
 *              usable only by the configured local owner UID.
 * individual – the user's own account via a registered OAuth app (not available yet).
 */
export type ConnectionMethod = 'local_demo' | 'individual';

export interface ConnectionRecord {
  uid: string;
  provider: ConnectionProvider;
  method: ConnectionMethod;
  state: ConnectionState;
  /** Machine-readable reason for `error` / `expired`. Never contains secrets. */
  errorCode: string | null;
  updatedAt: string;
}

/** What the browser may see: only the caller's own record, never credentials or another UID. */
export interface PublicConnection {
  provider: ConnectionProvider;
  method: ConnectionMethod;
  label: string;
  state: ConnectionState;
  /** Whether this method can be started right now. */
  available: boolean;
  /** Why `available` is false, if it is. */
  unavailableReason: 'individual_oauth_not_configured' | null;
  errorCode: string | null;
  updatedAt: string | null;
}

export const METHOD_LABELS: Record<ConnectionMethod, string> = {
  local_demo: 'Local demo connection',
  individual: 'Your account (OAuth)',
};

export const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  brightspace: 'Brightspace',
  piazza: 'Piazza',
};

/**
 * Individual connections stay off until a registered Brightspace OAuth app
 * (client ID/secret, redirect URI, scopes) exists AND the authorization-code
 * flow is implemented. Flipping this alone must not be enough to "connect".
 */
export const INDIVIDUAL_CONNECTIONS_AVAILABLE = false;

export interface ConnectionStore {
  get(uid: string, provider: ConnectionProvider): ConnectionRecord | null;
  put(record: ConnectionRecord): void;
  delete(uid: string, provider: ConnectionProvider): void;
}

/**
 * Process-memory store: enough for the loopback demo (lost on restart). A
 * deployed multi-user backend needs a persistent store (e.g. Firestore via the
 * Admin SDK) with tokens encrypted at rest.
 */
export class InMemoryConnectionStore implements ConnectionStore {
  private readonly records = new Map<string, ConnectionRecord>();
  private key(uid: string, provider: ConnectionProvider) {
    return `${provider}\u0000${uid}`;
  }
  get(uid: string, provider: ConnectionProvider) {
    return this.records.get(this.key(uid, provider)) ?? null;
  }
  put(record: ConnectionRecord) {
    this.records.set(this.key(record.uid, record.provider), { ...record });
  }
  delete(uid: string, provider: ConnectionProvider) {
    this.records.delete(this.key(uid, provider));
  }
}

export function setState(
  store: ConnectionStore,
  uid: string,
  provider: ConnectionProvider,
  method: ConnectionMethod,
  state: ConnectionState,
  errorCode: string | null = null,
): void {
  store.put({ uid, provider, method, state, errorCode, updatedAt: new Date().toISOString() });
}

/**
 * The caller's own connection for `provider`. `method` is decided by the
 * server from the verified UID, never from request input.
 */
export function describeConnection(
  store: ConnectionStore,
  uid: string,
  provider: ConnectionProvider,
  method: ConnectionMethod,
): PublicConnection {
  const record = store.get(uid, provider);
  // A record left over from another method (e.g. owner config changed) is ignored.
  const own = record && record.uid === uid && record.method === method ? record : null;

  if (method === 'individual' && !INDIVIDUAL_CONNECTIONS_AVAILABLE) {
    return {
      provider,
      method,
      label: METHOD_LABELS[method],
      state: 'not_connected',
      available: false,
      unavailableReason: 'individual_oauth_not_configured',
      errorCode: null,
      updatedAt: null,
    };
  }

  const baseLabel = PROVIDER_LABELS[provider];
  return {
    provider,
    method,
    label: method === 'local_demo' ? `${baseLabel} (local demo)` : `${baseLabel} account`,
    state: own?.state ?? 'not_connected',
    available: true,
    unavailableReason: null,
    errorCode: own?.errorCode ?? null,
    updatedAt: own?.updatedAt ?? null,
  };
}
