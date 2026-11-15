/**
 * Server-only configuration for the local Brightspace connector.
 * Loaded from server/.env.local (see server/.env.example). Nothing here is
 * ever sent to the browser, and none of it may use a VITE_ prefix.
 */

function trimmed(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

/** Loopback only: this prototype must never listen on a public interface. */
export const HOST = '127.0.0.1';
export const PORT = Number(trimmed('LOCAL_CONNECTOR_PORT') ?? 8787);

/** Firebase project whose ID tokens we accept. Not a secret. */
export const FIREBASE_PROJECT_ID = trimmed('FIREBASE_PROJECT_ID');

/**
 * The one Firebase user allowed to use the Brightspace session on this
 * computer. Must be set by hand; there is no first-visitor auto-assignment.
 */
export const OWNER_UID = trimmed('LOCAL_BRIGHTSPACE_OWNER_UID');

/**
 * The Brightspace uniqueName the session on this computer must belong to.
 * Checked before any course data is returned, so a re-sign-in as a different
 * Brightspace account can never leak into TrojanMind. Set by hand only.
 */
export const EXPECTED_UNIQUE_NAME = trimmed('LOCAL_BRIGHTSPACE_EXPECTED_UNIQUE_NAME');

/**
 * Optional: path to a Firebase Admin service-account JSON (standard Google
 * env var). When present we also reject revoked tokens. Never commit it.
 */
export const HAS_ADMIN_CREDENTIALS = Boolean(trimmed('GOOGLE_APPLICATION_CREDENTIALS'));

/**
 * How to launch the MCP server. Default is the package's documented Windows
 * command: `cmd /c npx -y brightspace-mcp-server@latest` (plain `npx` elsewhere).
 */
export function mcpLaunch(): { command: string; args: string[] } {
  const command = trimmed('BRIGHTSPACE_MCP_COMMAND');
  const argsJson = trimmed('BRIGHTSPACE_MCP_ARGS');
  if (command) {
    const args = argsJson ? (JSON.parse(argsJson) as unknown) : [];
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
      throw new Error('BRIGHTSPACE_MCP_ARGS must be a JSON array of strings');
    }
    return { command, args };
  }
  return process.platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'npx', '-y', 'brightspace-mcp-server@latest'] }
    : { command: 'npx', args: ['-y', 'brightspace-mcp-server@latest'] };
}

/** Origins allowed to call us (the Vite dev server). */
export const ALLOWED_ORIGINS = new Set(
  (trimmed('LOCAL_CONNECTOR_ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
);
