import React, { createContext, useContext, useEffect } from 'react';
import { useActiveAlerts } from './useActiveAlerts';
import { useAuth } from './AuthContext';

type AlertsContextType = ReturnType<typeof useActiveAlerts>;

const AlertsContext = createContext<AlertsContextType | undefined>(undefined);

/**
 * Shares one instance of useActiveAlerts() across the whole officer app —
 * Home, the Alerts tab, and the bottom-nav badge all read/update the same
 * state instead of each holding an independent copy. That matters for two
 * reasons: it avoids a duplicate GET /alerts/active per screen, and it
 * means acknowledging an alert from any one screen (Home's banner or the
 * Alerts list) is immediately reflected everywhere else, including the
 * bottom-nav badge count. Mirrors SyncContext's provider-wraps-a-hook
 * pattern.
 */
export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const value = useActiveAlerts();
  const { refresh } = value;

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token, refresh]);

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlertsContext() {
  const context = useContext(AlertsContext);
  if (!context) {
    throw new Error('useAlertsContext must be used within an AlertsProvider');
  }
  return context;
}
