import React, { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useStore } from '../store/store';

/**
 * Remounts the app per signed-in UID and clears the global store when that
 * user signs out or the account changes, so no in-memory study data, imported
 * material, or workspace carries over to the next person on this browser.
 */
const UserScope: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const uid = user?.uid ?? 'signed-out';
  useEffect(() => () => useStore.getState().resetUserState(), [uid]);
  return <React.Fragment key={uid}>{children}</React.Fragment>;
};

export default UserScope;
