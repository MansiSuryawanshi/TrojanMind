import { useContext } from 'react';
import { BrightspaceContext, type BrightspaceContextValue } from './brightspaceContext';

export function useBrightspace(): BrightspaceContextValue {
  const ctx = useContext(BrightspaceContext);
  if (!ctx) throw new Error('useBrightspace must be used inside <BrightspaceProvider>');
  return ctx;
}
