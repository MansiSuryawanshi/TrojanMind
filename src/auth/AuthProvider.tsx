import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../services/firebaseConfig';
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext';
import { isUscEmail } from './authErrors';

function deriveStatus(user: User | null, emailVerified: boolean): AuthStatus {
  if (!user) return 'signedOut';
  if (!isUscEmail(user.email)) return 'notAllowed';
  if (!emailVerified) return 'unverified';
  return 'ready';
}

/**
 * Wraps Firebase Authentication. Session persistence and token refresh are
 * handled entirely by the Firebase SDK; this provider only mirrors its state.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // User objects are mutated in place by reload(), so track the flag separately
  // to guarantee a re-render when verification status changes.
  const [emailVerified, setEmailVerified] = useState(false);
  const [initializing, setInitializing] = useState(isFirebaseConfigured);
  const [verificationSentAt, setVerificationSentAt] = useState<number | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    // Fires on restore-from-storage, sign-in, sign-out, and token refresh.
    const unsubscribe = onIdTokenChanged(auth, (next) => {
      setUser(next);
      setEmailVerified(next?.emailVerified ?? false);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const normalized = email.trim();
    if (!isUscEmail(normalized)) {
      // Mirrors the UI check; the provider-side rule is a console setting (see README).
      throw Object.assign(new Error('USC email required'), { code: 'app/not-usc-email' });
    }
    const cred = await createUserWithEmailAndPassword(auth, normalized, password);
    await sendEmailVerification(cred.user);
    setVerificationSentAt(Date.now());
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setVerificationSentAt(null);
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) throw Object.assign(new Error('Not signed in'), { code: 'auth/user-token-expired' });
    await sendEmailVerification(auth.currentUser);
    setVerificationSentAt(Date.now());
  }, []);

  const refreshVerification = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return false;
    await current.reload();
    // Force a fresh ID token so its email_verified claim matches.
    if (current.emailVerified) await current.getIdToken(true);
    const refreshed = auth.currentUser;
    setUser(refreshed);
    setEmailVerified(refreshed?.emailVerified ?? false);
    return refreshed?.emailVerified ?? false;
  }, []);

  const status: AuthStatus = !isFirebaseConfigured
    ? 'misconfigured'
    : initializing
      ? 'loading'
      : deriveStatus(user, emailVerified);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, verificationSentAt, signUp, signIn, signOut, resendVerification, refreshVerification }),
    [status, user, verificationSentAt, signUp, signIn, signOut, resendVerification, refreshVerification],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
