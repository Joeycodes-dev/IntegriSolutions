import { Login } from './components/Login';
import { OfficerDashboard } from './components/OfficerDashboard';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { useAuth } from './lib/AuthContext';

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Login />;
  if (profile?.role === 'supervisor') return <SupervisorDashboard />;

  return <OfficerDashboard />;
}
