import { Login } from './components/Login';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { useAuth } from './lib/AuthContext';

export default function App() {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) return null;
  if (!user) return <Login />;
  if (profile?.role === 'supervisor') return <SupervisorDashboard />;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Officer tools are mobile only</h1>
        <p className="text-slate-600 mb-6">
          The officer portal now lives in the mobile app. Use the mobile app to scan licenses and manage roadside stops.
        </p>
        <p className="text-sm text-slate-500">If you need supervisor access, sign in with a supervisor account.</p>
        <button
          onClick={signOut}
          className="mt-4 w-full rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
