/**
 * Every Claude request from the browser goes through the TrojanMind backend
 * (server/index.ts → POST /ai/messages), which adds the API key server-side.
 * The browser only sends the signed-in user's Firebase ID token.
 */
import { auth } from './firebaseConfig';

/** Proxied by the Vite dev server to the localhost backend. */
export const AI_ENDPOINT = '/local-api/ai/messages';

/** Same call shape as fetch(url, init); any caller-supplied headers are replaced. */
export async function aiFetch(url: string, init: { method?: string; body?: string; headers?: unknown }): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to TrojanMind to use AI features.');
  const token = await user.getIdToken();
  return fetch(url, {
    method: init.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: init.body,
    cache: 'no-store',
  });
}
