import { useCallback, useEffect, useState } from 'react';
import { getPortalUsers, removePortalUser } from '../../services/api';
import type { PortalUser } from '../../types';
import { AddSupervisor } from './AddSupervisor';

const NAVY = '#0D2137';
const PAGE_BG = '#F1F5F9';
const BORDER = '#E2E8F0';

export function UserManagement() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'add'>('list');
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPortalUsers();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleRemove = async (user: PortalUser) => {
    if (!window.confirm(`Remove ${user.name} from the portal?`)) return;

    setRemovingId(user.officerId);
    try {
      await removePortalUser(user.officerId);
      setUsers((prev) => prev.filter((u) => u.officerId !== user.officerId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setRemovingId(null);
    }
  };

  if (view === 'add') {
    return (
      <AddSupervisor
        onBack={() => setView('list')}
        onCreated={(created) => {
          setUsers((prev) => [created, ...prev]);
          setView('list');
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col" style={{ backgroundColor: PAGE_BG }}>
      <header className="flex items-start justify-between gap-4 px-8 pb-4 pt-8">
        <div>
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            User Management
          </h1>
          <p className="mt-1 text-[0.8125rem] text-slate-500">
            Create, activate, and manage Supervisor/Admin portal users.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setView('add')}
          className="shrink-0 rounded-full px-5 py-2 text-[0.8125rem] font-bold text-white transition hover:brightness-110"
          style={{ backgroundColor: NAVY }}
        >
          Add New User
        </button>
      </header>

      <div className="flex-1 px-8 pb-8">
        <div
          className="overflow-hidden rounded-xl border bg-white"
          style={{ borderColor: BORDER }}
        >
          {error && (
            <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-[0.8125rem] text-rose-700">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b" style={{ borderColor: BORDER }}>
                  {['USER ID', 'NAME', 'ROLE', 'STATION', 'STATUS', 'ACTION'].map((col) => (
                    <th
                      key={col}
                      className="px-5 py-3 text-[10px] font-bold tracking-[0.12em]"
                      style={{ color: NAVY }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[0.8125rem] text-slate-500">
                      Loading users…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[0.8125rem] text-slate-500">
                      No portal users yet. Add a supervisor or admin to get started.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.officerId}
                      className="border-b last:border-b-0"
                      style={{ borderColor: BORDER }}
                    >
                      <td className="px-5 py-3.5 font-mono text-[0.75rem] text-slate-600">
                        {user.userId}
                      </td>
                      <td className="px-5 py-3.5 text-[0.8125rem] font-medium text-slate-800">
                        {user.name}
                      </td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-slate-700">{user.role}</td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-slate-700">{user.station}</td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-slate-700">{user.status}</td>
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() => void handleRemove(user)}
                          disabled={removingId === user.officerId}
                          className="text-[0.8125rem] font-bold disabled:opacity-50"
                          style={{ color: NAVY }}
                        >
                          {removingId === user.officerId ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
