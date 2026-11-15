import React, { useEffect, useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { authErrorMessage } from '../../auth/authErrors';
import AuthShell, { AuthNotice } from './AuthShell';

const RESEND_COOLDOWN_S = 30;

type Busy = 'resend' | 'check' | 'signout' | null;

const VerifyEmailScreen: React.FC = () => {
  const { user, verificationSentAt, resendVerification, refreshVerification, signOut } = useAuth();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(() => {
    if (!verificationSentAt) return 0;
    const elapsed = Math.floor((Date.now() - verificationSentAt) / 1000);
    return Math.max(0, RESEND_COOLDOWN_S - elapsed);
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleResend = () =>
    run('resend', async () => {
      await resendVerification();
      setNotice('Verification email sent. Check your inbox (and spam folder).');
      setCooldown(RESEND_COOLDOWN_S);
    });

  const handleCheck = () =>
    run('check', async () => {
      const verified = await refreshVerification();
      // If verified, the AuthGate switches to the app on its own.
      if (!verified) setError("We couldn't confirm verification yet. Open the link in the email, then try again.");
    });

  const handleSignOut = () => run('signout', signOut);

  return (
    <AuthShell>
      <div className="w-12 h-12 rounded-xl bg-gold-soft text-gold-ink flex items-center justify-center mb-5" aria-hidden="true">
        <MailCheck size={24} />
      </div>
      <p className="eyebrow mb-2">One more step</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Verify your email</h1>
      <p className="mt-2 text-sm text-muted leading-relaxed">
        {verificationSentAt ? 'We sent a verification link to' : 'Your account needs a verified email. Check for a link sent to'}{' '}
        <span className="font-semibold text-ink break-all">{user?.email}</span>. Open it, then come back here
        and confirm. Need a new link? Use “Resend verification email.”
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {error && <AuthNotice tone="error">{error}</AuthNotice>}
        {notice && <AuthNotice tone="success">{notice}</AuthNotice>}

        <button type="button" className="btn-primary w-full py-3 rounded-lg font-semibold" onClick={handleCheck} disabled={busy !== null}>
          {busy === 'check' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          I've verified my email
        </button>

        <button
          type="button"
          className="btn-secondary w-full py-3 rounded-lg font-semibold"
          onClick={handleResend}
          disabled={busy !== null || cooldown > 0}
        >
          {busy === 'resend' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {cooldown > 0 ? `Resend verification email (${cooldown}s)` : 'Resend verification email'}
        </button>

        <button type="button" className="btn-link py-2 text-sm" onClick={handleSignOut} disabled={busy !== null}>
          Sign out
        </button>
      </div>
    </AuthShell>
  );
};

export default VerifyEmailScreen;
