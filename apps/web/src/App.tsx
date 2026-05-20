import { useState } from 'react';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { Login } from './components/Login';
import { PortalAccessDenied } from './components/PortalAccessDenied';
import { SplashScreen } from './components/SplashScreen';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { useAuth } from './lib/AuthContext';
import { canAccessWebPortal, isAdmin, isSupervisor } from './lib/roles';

const SPLASH_MIN_MS = import.meta.env.VITEST ? 0 : 2200;

function AuthenticatedApp() {
  const { profile } = useAuth();

  if (!profile) return <Login />;

  if (!canAccessWebPortal(profile.roleId)) {
    return <PortalAccessDenied />;
  }

  if (isAdmin(profile.roleId)) {
    return <AdminDashboard />;
  }

  if (isSupervisor(profile.roleId)) {
    return <SupervisorDashboard />;
  }

  return <PortalAccessDenied />;
}

export default function App() {
  const { user, loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  if (!splashDone) {
    return (
      <SplashScreen
        onComplete={() => setSplashDone(true)}
        ready={!loading}
        minDurationMs={SPLASH_MIN_MS}
      />
    );
  }

  if (!user) return <Login />;
  return <AuthenticatedApp />;
}
