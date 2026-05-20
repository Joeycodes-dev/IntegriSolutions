import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useSupervisorTests } from '../hooks/useSupervisorTests';
import type { SupervisorNavItem, TestRecord } from '../types';
import { SupervisorSidebar } from './supervisor/SupervisorSidebar';
import { SupervisorOverview } from './supervisor/SupervisorOverview';
import { SupervisorLogs } from './supervisor/SupervisorLogs';
import { SupervisorOfficers } from './supervisor/SupervisorOfficers';
import { SupervisorReports } from './supervisor/SupervisorReports';
import { EvidenceReview } from './supervisor/EvidenceReview';

export function SupervisorDashboard() {
  const { signOut } = useAuth();
  const [activeNav, setActiveNav] = useState<SupervisorNavItem>('dashboard');
  const [selectedTest, setSelectedTest] = useState<TestRecord | null>(null);
  const { tests, loading, error, metrics } = useSupervisorTests();

  const handleNavigate = (item: SupervisorNavItem) => {
    setActiveNav(item);
    setSelectedTest(null);
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
        <SupervisorOverview metrics={metrics} loading={loading} error={error} />
      )}
      {activeNav === 'logs' && selectedTest && (
        <EvidenceReview test={selectedTest} onBack={() => setSelectedTest(null)} />
      )}
      {activeNav === 'logs' && !selectedTest && (
        <SupervisorLogs
          tests={tests}
          loading={loading}
          error={error}
          onSelectTest={setSelectedTest}
        />
      )}
      {activeNav === 'officers' && <SupervisorOfficers tests={tests} />}
      {activeNav === 'reports' && <SupervisorReports tests={tests} loading={loading} />}
      </main>
    </div>
  );
}
