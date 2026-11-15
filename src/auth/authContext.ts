import { createContext } from 'react';
import type { User } from 'firebase/auth';

/**
 * loading       – initial Firebase session check hasn't finished
 * misconfigured – Firebase env vars are missing (dummy keys in use)
 * signedOut     – no session
 * unverified    – signed in, email not yet verified
 * notAllowed    – signed in with an email outside usc.edu
 * ready         – signed in, verified, usc.edu → app access
 */
export type AuthStatus = 'loading' | 'misconfigured' | 'signedOut' | 'unverified' | 'notAllowed' | 'ready';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** ms timestamp of the last verification email sent in this tab, if any. */
  verificationSentAt: number | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<void>;
  /** Reloads the user from Firebase; resolves true if the email is now verified. */
  refreshVerification: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
