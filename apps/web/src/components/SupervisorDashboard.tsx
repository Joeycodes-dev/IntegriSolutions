import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useSupervisorTests } from '../hooks/useSupervisorTests';
import type { SupervisorNavItem } from '../types';
import { SupervisorSidebar } from './supervisor/SupervisorSidebar';
import { SupervisorOverview } from './supervisor/SupervisorOverview';
import { SupervisorLogs } from './supervisor/SupervisorLogs';
import { SupervisorOfficers } from './supervisor/SupervisorOfficers';
import { SupervisorReports } from './supervisor/SupervisorReports';
import { SupervisorShifts } from './supervisor/SupervisorShifts';
import { SupervisorAlerts } from './supervisor/SupervisorAlerts';
import { SupervisorCases } from './supervisor/SupervisorCases';
import { EmergencyChatPanel } from './chat/EmergencyChatPanel';
import { RoadOffenceReview } from './RoadOffenceReview';

export function SupervisorDashboard() {
  const { signOut, profile } = useAuth();
  const [activeNav, setActiveNav] = useState<SupervisorNavItem>('dashboard');
  const { tests, loading, error, metrics, streamConnected, lastEventAt } = useSupervisorTests();

  const handleNavigate = (item: SupervisorNavItem) => {
    setActiveNav(item);
  };

  return (
    <div className="flex min-h-screen w-full">
      <SupervisorSidebar
        active={activeNav}
        onNavigate={handleNavigate}
        onLogout={() => void signOut()}
      />

      <main className="flex min-w-0 flex-1 flex-col">
      {activeNav === 'dashboard' && (
        <SupervisorOverview
          metrics={metrics}
          loading={loading}
          error={error}
          streamConnected={streamConnected}
          lastEventAt={lastEventAt}
          tests={tests}
        />
      )}
      {activeNav === 'logs' && (
        <SupervisorLogs
          tests={tests}
          loading={loading}
          error={error}
        />
      )}
      {activeNav === 'cases' && <SupervisorCases />}
      {activeNav === 'officers' && <SupervisorOfficers tests={tests} />}
      {activeNav === 'shifts' && <SupervisorShifts />}
      {activeNav === 'alerts' && <SupervisorAlerts />}
      {activeNav === 'reports' && (
        <SupervisorReports tests={tests} loading={loading} error={error} />
      )}
      {activeNav === 'roadOffences' && <RoadOffenceReview />}
      {activeNav === 'chat' && <EmergencyChatPanel profile={profile} />}
      </main>
    </div>
  );
}
