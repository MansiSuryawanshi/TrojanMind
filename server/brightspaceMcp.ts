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
import { mcpLaunch } from './config.ts';

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
const AUTH_COMMAND = 'npx -y brightspace-mcp-server@latest auth';

let clientPromise: Promise<Client> | null = null;

function connect(): Promise<Client> {
  if (clientPromise) return clientPromise;
  const { command, args } = mcpLaunch();
  const transport = new StdioClientTransport({
    command,
    args,
    // SDK's safe default env (PATH, USERPROFILE, APPDATA, ...) so the server can
    // reach its own keychain entry and encrypted session. We add nothing secret
    // and change no sign-in / MFA preferences.
    env: { ...getDefaultEnvironment(), D2L_NO_UPDATE_CHECK: '1' },
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
  if (isErrorResult(result)) throw authErrorFrom(blocks[0]);
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

/**
 * The Brightspace uniqueName of the session saved on this computer, read
 * locally by get_server_info (no network, never triggers sign-in). Null when
 * no signed-in identity is recorded.
 */
export async function getSignedInUniqueName(): Promise<string | null> {
  const result = await call('get_server_info');
  if (isErrorResult(result)) throw new ConnectorError('tool', 'Could not read the Brightspace connection status.');
  const text = textBlocks(result)[0];
  try {
    const info = JSON.parse(text ?? '') as { signedInAs?: { uniqueName?: unknown } };
    return str(info?.signedInAs?.uniqueName)?.trim() ?? null;
  } catch {
    throw new ConnectorError('parse', 'Unexpected status format from the Brightspace connector.');
  }
}

export async function closeConnector(): Promise<void> {
  const p = clientPromise;
  clientPromise = null;
  if (p) await p.then((c) => c.close()).catch(() => undefined);
}
