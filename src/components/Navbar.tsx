import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useBrightspace } from '../brightspace/useBrightspace';

interface NavbarProps {
  activeTab: number;
  setActiveTab: (tab: number) => void;
}

const navItems = [
  { label: 'Home', index: 0 },
  { label: 'Upload', index: 1 },
  { label: 'Summary', index: 2 },
  { label: 'Challenge', index: 3 },
  { label: 'Exam Prep', index: 4 },
  { label: 'Study Schedule', index: 5 },
  { label: 'Study Report', index: 6 },
  { label: 'My Courses', index: 7 },
];

const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { status: bs } = useBrightspace();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut(); // AuthGate then shows the login screen
    } catch {
      setSigningOut(false);
    }
  };

  const go = (index: number) => {
    setActiveTab(index);
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-[100] bg-surface/95 backdrop-blur-sm border-b border-line">
      <nav
        aria-label="Primary"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4"
      >
        {/* Brand */}
        <button
          type="button"
          onClick={() => go(0)}
          className="flex items-center gap-3 cursor-pointer text-left"
          aria-label="TrojanMind home"
        >
          <span className="brand-mark" aria-hidden="true">TM</span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-extrabold tracking-tight text-cardinal">TrojanMind</span>
            <span className="hidden sm:block text-[11px] font-medium text-muted mt-1">
              Learn together. Reason deeper.
            </span>
          </span>
        </button>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const active = activeTab === item.index;
            return (
              <button
                key={item.index}
                type="button"
                onClick={() => go(item.index)}
                aria-current={active ? 'page' : undefined}
                className={`relative px-3 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
                  active ? 'text-cardinal' : 'text-muted hover:text-ink hover:bg-sunken'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-[13px] h-0.5 bg-cardinal rounded-full" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <BrightspacePill status={bs} onClick={() => go(7)} />

          <button
            type="button"
            onClick={() => go(1)}
            className="btn-primary px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold"
          >
            Get Started
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            title={user?.email ? `Signed in as ${user.email}` : undefined}
            className="btn-secondary px-3 py-2 rounded-lg text-sm font-semibold"
            aria-label="Log out"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{signingOut ? 'Logging out…' : 'Log out'}</span>
          </button>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg text-ink hover:bg-sunken cursor-pointer"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile nav panel */}
      {menuOpen && (
        <div id="mobile-nav" className="lg:hidden border-t border-line bg-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-col">
            {navItems.map((item) => {
              const active = activeTab === item.index;
              return (
                <button
                  key={item.index}
                  type="button"
                  onClick={() => go(item.index)}
                  aria-current={active ? 'page' : undefined}
                  className={`text-left px-3 py-3 rounded-lg text-sm font-semibold cursor-pointer border-l-2 ${
                    active
                      ? 'border-cardinal bg-cardinal-soft text-cardinal'
                      : 'border-transparent text-ink hover:bg-sunken'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            {user?.email && (
              <p className="px-3 pt-3 mt-1 border-t border-line text-xs text-muted break-all">
                Signed in as <span className="font-semibold text-ink">{user.email}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

/** Compact Brightspace status. Hidden when there is nothing useful to say here. */
const BrightspacePill: React.FC<{ status: ReturnType<typeof useBrightspace>['status']; onClick: () => void }> = ({ status, onClick }) => {
  let label: string;
  let icon: React.ReactNode;
  let cls: string;
  switch (status.kind) {
    case 'connecting':
      label = 'Connecting to Brightspace…';
      icon = <Loader2 size={14} className="animate-spin" aria-hidden="true" />;
      cls = 'bg-sunken text-muted border-line';
      break;
    case 'action_required':
    case 'pending':
      label = 'Brightspace: action needed';
      icon = <AlertCircle size={14} aria-hidden="true" />;
      cls = 'bg-gold-soft text-gold-ink border-gold/60';
      break;
    case 'connected':
      label = 'Brightspace connected';
      icon = <CheckCircle2 size={14} aria-hidden="true" />;
      cls = 'bg-success-soft text-success border-success/25';
      break;
    case 'error':
      if (status.code === 'unreachable' || status.code === 'not_owner') return null;
      label = 'Brightspace: not connected';
      icon = <AlertCircle size={14} aria-hidden="true" />;
      cls = 'bg-danger-soft text-danger border-danger/30';
      break;
    default:
      return null;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title="Open My Courses"
      aria-label={`${label}. Open My Courses`}
      className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-semibold cursor-pointer ${cls}`}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
};

export default Navbar;
