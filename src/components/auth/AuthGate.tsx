import React, { useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import AuthShell, { AuthNotice } from './AuthShell';
import AuthScreen from './AuthScreen';
import VerifyEmailScreen from './VerifyEmailScreen';

/**
 * Client-side UI gate: renders the app only for a signed-in user with a
 * verified @usc.edu email. This controls what the browser shows; it does NOT
 * protect Firestore or any API — those need their own server-side rules.
 */
const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();

  switch (status) {
    case 'loading':
      return (
        <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
          <span className="brand-mark w-12 h-12 text-base rounded-xl" aria-hidden="true">TM</span>
          <div className="spinner" aria-hidden="true" />
          <span className="text-sm font-medium text-muted">Checking your session…</span>
        </div>
      );
    case 'misconfigured':
      return (
        <AuthShell>
          <p className="eyebrow mb-2">Setup required</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Authentication isn't configured</h1>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            The Firebase environment variables are missing, so sign-in is unavailable. Copy{' '}
            <code className="font-mono text-ink">.env.example</code> to <code className="font-mono text-ink">.env.local</code>,
            fill in your Firebase web app config, and restart the dev server.
          </p>
        </AuthShell>
      );
    case 'signedOut':
      return <AuthScreen />;
    case 'unverified':
      return <VerifyEmailScreen />;
    case 'notAllowed':
      return <NotAllowedScreen />;
    case 'ready':
      return <>{children}</>;
  }
};

const NotAllowedScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell>
      <p className="eyebrow mb-2">Access restricted</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">USC email required</h1>
      <div className="mt-4">
        <AuthNotice tone="info">
          <span className="break-all">{user?.email}</span> isn't a @usc.edu address. TrojanMind is available
          only to accounts with a verified @usc.edu email.
        </AuthNotice>
      </div>
      <button
        type="button"
        className="btn-primary w-full py-3 rounded-lg font-semibold mt-6"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try { await signOut(); } finally { setBusy(false); }
        }}
      >
        Sign out
      </button>
    </AuthShell>
  );
};

export default AuthGate;
