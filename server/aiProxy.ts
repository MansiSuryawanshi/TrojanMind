/**
 * Server-side Claude proxy. The browser sends a Messages API body plus its
 * Firebase ID token; the API key is added here and never leaves the server.
 * Only the request fields TrojanMind's existing features use are forwarded.
 */
import { ANTHROPIC_API_KEY } from './config.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const UPSTREAM_TIMEOUT_MS = 180_000;
const MAX_TOKENS_CAP = 16_000;
const ALLOWED_FIELDS = new Set(['model', 'max_tokens', 'messages', 'system', 'temperature', 'thinking', 'output_config', 'stop_sequences']);

export const aiConfigured = () => Boolean(ANTHROPIC_API_KEY);

export class AiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Keep only known Messages API fields, with sane bounds. */
export function sanitizeAiBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AiRequestError(400, 'invalid_ai_request', 'Invalid AI request.');
  const b = body as Record<string, unknown>;
  if (typeof b.model !== 'string' || !/^claude-[a-z0-9.-]{1,60}$/.test(b.model)) throw new AiRequestError(400, 'invalid_ai_request', 'Unsupported model.');
  if (typeof b.max_tokens !== 'number' || !Number.isInteger(b.max_tokens) || b.max_tokens < 1 || b.max_tokens > MAX_TOKENS_CAP) {
    throw new AiRequestError(400, 'invalid_ai_request', 'Invalid max_tokens.');
  }
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 200) throw new AiRequestError(400, 'invalid_ai_request', 'Invalid messages.');
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) if (ALLOWED_FIELDS.has(k)) out[k] = v;
  return out;
}

/** Forward to Anthropic. Returns the upstream status and JSON text unchanged. */
export async function forwardToAnthropic(body: Record<string, unknown>): Promise<{ status: number; text: string }> {
  if (!ANTHROPIC_API_KEY) {
    throw new AiRequestError(503, 'ai_not_configured', 'AI is not configured on the TrojanMind backend. Set ANTHROPIC_API_KEY in server/.env.local and restart `npm run server`.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: res.status, text: await res.text() };
  } catch {
    throw new AiRequestError(502, 'ai_unreachable', 'Couldn’t reach the AI service. Try again.');
  } finally {
    clearTimeout(timer);
  }
}
