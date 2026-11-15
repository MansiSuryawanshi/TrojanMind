import React from 'react';

/** Centered branded card used by every pre-app auth screen. */
const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-canvas text-ink flex flex-col">
    <header className="border-b border-line bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
        <span className="brand-mark" aria-hidden="true">TM</span>
        <span className="flex flex-col leading-none">
          <span className="text-lg font-extrabold tracking-tight text-cardinal">TrojanMind</span>
          <span className="hidden sm:block text-[11px] font-medium text-muted mt-1">
            Learn together. Reason deeper.
          </span>
        </span>
      </div>
    </header>
    <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md animate-slide-up">
        <div className="h-1 rounded-t-2xl bg-gold" aria-hidden="true" />
        <div className="surface-raised rounded-b-2xl px-6 py-8 sm:px-8">{children}</div>
      </div>
    </main>
  </div>
);

export default AuthShell;

/** Inline error/notice banner. role=alert so screen readers announce it. */
export const AuthNotice: React.FC<{ tone: 'error' | 'success' | 'info'; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const styles = {
    error: 'bg-danger-soft text-danger border-danger/30',
    success: 'bg-success-soft text-success border-success/30',
    info: 'bg-gold-soft text-gold-ink border-gold/50',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`border rounded-lg px-4 py-3 text-sm font-medium ${styles}`}>
      {children}
    </div>
  );
};
