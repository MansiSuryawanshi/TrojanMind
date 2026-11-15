import { createContext } from 'react';

export const NOT_OWNER_MESSAGE = 'Brightspace connection is available only to the configured local demo account.';

export interface Course {
  id: number;
  name: string;
  code: string | null;
  role: string | null;
  isActive: boolean | null;
  canAccess: boolean | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * idle            – nothing attempted yet
 * connecting      – a request to the local connector is running
 * connected       – courses retrieved and identity confirmed
 * action_required – the person at this computer must do something (e.g. approve Duo)
 * pending         – sign-in still working on its own; check again shortly
 * error           – failed, misconfigured, not the owner, or connector unreachable
 */
export type BrightspaceStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; courses: Course[]; retrievedAt: string }
  | { kind: 'action_required' | 'pending'; message: string }
  | { kind: 'error'; code: string; message: string };

export interface BrightspaceContextValue {
  status: BrightspaceStatus;
  /** Start (or re-check) the connection. Ignored while one is already running. */
  connect: () => void;
}

export const BrightspaceContext = createContext<BrightspaceContextValue | null>(null);
