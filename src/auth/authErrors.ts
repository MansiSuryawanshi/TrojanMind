/**
 * Turns Firebase Auth errors into user-facing messages.
 * Only the error *code* is used; we never echo raw error payloads,
 * emails, passwords, or tokens back to the UI or the console.
 */
const MESSAGES: Record<string, string> = {
  'app/not-usc-email': 'Use your @usc.edu email address to create an account.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in instead.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/password-does-not-meet-requirements': 'Password does not meet the requirements. Use at least 8 characters with a mix of letters and numbers.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled for this project yet.',
  'auth/configuration-not-found': 'Authentication is not set up for this Firebase project yet.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase is not configured correctly (invalid API key).',
  'auth/invalid-api-key': 'Firebase is not configured correctly (invalid API key).',
  'auth/user-token-expired': 'Your session expired. Please log in again.',
  'auth/requires-recent-login': 'Please log in again to continue.',
};

export function authErrorMessage(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

/** Signup rule: the email's domain must be exactly "usc.edu" (no subdomains). */
export function isUscEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return false;
  return normalized.slice(at + 1) === 'usc.edu';
}
