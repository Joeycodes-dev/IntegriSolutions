import { Login } from './components/Login';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { useAuth } from './lib/AuthContext';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Login />;
  // TODO: gate by supervisor role when supervisor_users table is implemented
  return <SupervisorDashboard />;


}
