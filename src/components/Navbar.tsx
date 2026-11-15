import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useBrightspace } from '../brightspace/useBrightspace';
import { HOME_TABS } from './homeTabs';

interface NavbarProps {
  activeTab: number;
  setActiveTab: (tab: number) => void;
}

// Upload (tab 1) is intentionally not a top-level item: it's the secondary way to
// add material, reached from My Courses, the homepage, and the Challenge page.
// While on it, "My Courses" stays highlighted as the materials section.
const navItems = [
  { label: 'Home', index: HOME_TABS.home },
  { label: 'My Courses', index: HOME_TABS.courses, alsoActiveFor: [HOME_TABS.upload] },
  { label: 'Summary', index: HOME_TABS.summary },
  { label: 'Challenge', index: HOME_TABS.challenge },
  { label: 'Exam Prep', index: HOME_TABS.examPrep },
  { label: 'Study Schedule', index: HOME_TABS.schedule },
  { label: 'Study Report', index: HOME_TABS.report },
];

const isActive = (item: { index: number; alsoActiveFor?: readonly number[] }, activeTab: number) =>
  activeTab === item.index || (item.alsoActiveFor?.includes(activeTab) ?? false);

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
          onClick={() => go(HOME_TABS.home)}
          className="flex items-center gap-3 cursor-pointer text-left"
          aria-label="TrojanMind home"
        >
          <span className="brand-mark" aria-hidden="true">TM</span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-extrabold tracking-tight text-cardinal">TrojanMind</span>
            <span className="hidden sm:block xl:hidden 2xl:block whitespace-nowrap text-[11px] font-medium text-muted mt-1">
              Learn together. Reason deeper.
            </span>
          </span>
        </button>

        {/* Desktop nav */}
        <div className="hidden xl:flex items-center gap-1">
          {navItems.map((item) => {
            const active = isActive(item, activeTab);
            return (
              <button
                key={item.index}
                type="button"
                onClick={() => go(item.index)}
                aria-current={active ? 'page' : undefined}
                className={`relative px-3 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
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
          <BrightspacePill status={bs} onClick={() => go(HOME_TABS.courses)} />

          <button
            type="button"
            onClick={() => go(HOME_TABS.courses)}
            className="btn-primary px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
          >
            Get Started
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            title={user?.email ? `Signed in as ${user.email}` : undefined}
            className="btn-secondary px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
            aria-label="Log out"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{signingOut ? 'Logging out…' : 'Log out'}</span>
          </button>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="xl:hidden p-2 rounded-lg text-ink hover:bg-sunken cursor-pointer"
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
        <div id="mobile-nav" className="xl:hidden border-t border-line bg-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-col">
            {navItems.map((item) => {
              const active = isActive(item, activeTab);
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
      label = 'Brightspace connected (local demo)';
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
      <span className="hidden 2xl:inline whitespace-nowrap">{label}</span>
    </button>
  );
};

export default Navbar;
