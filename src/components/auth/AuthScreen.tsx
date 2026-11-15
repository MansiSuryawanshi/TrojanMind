import React, { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { authErrorMessage, isUscEmail } from '../../auth/authErrors';
import AuthShell, { AuthNotice } from './AuthShell';

type Mode = 'login' | 'signup';
const MIN_PASSWORD = 8;

const inputClass =
  'w-full bg-surface border border-line-strong rounded-lg px-4 py-3 text-ink placeholder-muted/70 ' +
  'focus:outline-none focus:border-cardinal focus:ring-4 focus:ring-cardinal/10 transition-colors';

const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
  };

  const validate = (): string | null => {
    if (!email.trim()) return 'Enter your email address.';
    if (!password) return 'Enter your password.';
    if (isSignup) {
      if (!isUscEmail(email)) return 'Use your @usc.edu email address to create an account.';
      if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
      if (password !== confirm) return 'Passwords do not match.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isSignup) await signUp(email, password);
      else await signIn(email, password);
      // On success the AuthGate swaps this screen out automatically.
    } catch (err) {
      setError(authErrorMessage(err));
      setPassword('');
      setConfirm('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <p className="eyebrow mb-2">{isSignup ? 'Create account' : 'Welcome back'}</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">
        {isSignup ? 'Create your TrojanMind account' : 'Log in to TrojanMind'}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {isSignup
          ? 'TrojanMind accounts require a verified @usc.edu email address.'
          : 'Use the email and password for your TrojanMind account.'}
      </p>

      {/* Mode toggle */}
      <div className="mt-6 grid grid-cols-2 p-1 bg-sunken rounded-lg border border-line" role="tablist" aria-label="Account mode">
        {(['login', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`py-2 rounded-md text-sm font-semibold cursor-pointer transition-colors ${
              mode === m ? 'bg-surface text-cardinal shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {m === 'login' ? 'Log in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {error && <AuthNotice tone="error">{error}</AuthNotice>}

        <div>
          <label htmlFor="auth-email" className="block text-sm font-semibold text-ink mb-1.5">
            {isSignup ? 'USC email' : 'Email'}
          </label>
          <input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ttrojan@usc.edu"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-sm font-semibold text-ink mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              className={`${inputClass} pr-12`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
              minLength={isSignup ? MIN_PASSWORD : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-muted hover:text-cardinal cursor-pointer"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {isSignup && <p className="mt-1.5 text-xs text-muted">At least {MIN_PASSWORD} characters.</p>}
        </div>

        {isSignup && (
          <div>
            <label htmlFor="auth-confirm" className="block text-sm font-semibold text-ink mb-1.5">
              Confirm password
            </label>
            <input
              id="auth-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
        )}

        <button type="submit" className="btn-primary w-full py-3 rounded-lg font-semibold mt-2" disabled={submitting}>
          {submitting && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {submitting ? (isSignup ? 'Creating account…' : 'Logging in…') : isSignup ? 'Create account' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted text-center">
        {isSignup ? 'Already have an account? ' : 'New to TrojanMind? '}
        <button type="button" className="btn-link text-cardinal underline-offset-2 hover:underline" onClick={() => switchMode(isSignup ? 'login' : 'signup')}>
          {isSignup ? 'Log in' : 'Create an account'}
        </button>
      </p>

      <p className="mt-6 pt-5 border-t border-line text-xs text-muted text-center leading-relaxed">
        TrojanMind is an independent student project. This is a TrojanMind account,
        not USC single sign-on.
      </p>
    </AuthShell>
  );
};

export default AuthScreen;
