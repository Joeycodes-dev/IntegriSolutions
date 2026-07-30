import { useCallback, useEffect, useState } from 'react';
import { getPortalUsers, removePortalUser, updatePortalUser } from '../../services/api';
import type { PortalUser } from '../../types';
import { AddAdmin } from './AddAdmin';
import { AddSupervisor } from './AddSupervisor';

const NAVY = '#0D2137';
const PAGE_BG = '#F1F5F9';
const BORDER = '#E2E8F0';

export function UserManagement() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'add-supervisor' | 'add-admin'>('list');
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const handleToggleStatus = async (user: PortalUser) => {
    const nextStatus = user.status.toLowerCase() === 'active' ? 'Inactive' : 'Active';
    if (!window.confirm(`Set ${user.name} to ${nextStatus}?`)) return;

    setBusyId(user.userId);
    try {
      const updated = await updatePortalUser(
        user.officerId,
        { status: nextStatus },
        { source: user.source, roleId: user.roleId }
      );
      setUsers((prev) => prev.map((u) => (u.userId === user.userId ? { ...u, ...updated } : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (user: PortalUser) => {
    if (!window.confirm(`Remove ${user.name} from the portal?`)) return;

    setBusyId(user.userId);
    try {
      await removePortalUser(user.officerId, {
        source: user.source,
        roleId: user.roleId
      });
      setUsers((prev) => prev.filter((u) => u.userId !== user.userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setBusyId(null);
    }
  };

  if (view === 'add-supervisor') {
    return (
      <AddSupervisor
        onBack={() => setView('list')}
        onCreated={(created) => {
          setUsers((prev) => [created, ...prev]);
        }}
      />
    );
  }

  if (view === 'add-admin') {
    return (
      <AddAdmin
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
            Admins add supervisors here. Supervisors add field officers from the Officers screen.
            Test records are immutable — only account status can be updated.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView('add-admin')}
            className="rounded-full border bg-white px-5 py-2 text-[0.8125rem] font-bold transition hover:bg-slate-50"
            style={{ borderColor: BORDER, color: NAVY }}
          >
            Add Admin
          </button>
          <button
            type="button"
            onClick={() => setView('add-supervisor')}
            className="rounded-full px-5 py-2 text-[0.8125rem] font-bold text-white transition hover:brightness-110"
            style={{ backgroundColor: NAVY }}
          >
            Add Supervisor
          </button>
        </div>
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
                  users.map((user) => {
                    const isActive = user.status.toLowerCase() === 'active';
                    return (
                      <tr
                        key={user.userId}
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
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => void handleToggleStatus(user)}
                              disabled={busyId === user.userId}
                              className="text-[0.8125rem] font-bold disabled:opacity-50"
                              style={{ color: isActive ? '#b45309' : '#15803d' }}
                            >
                              {busyId === user.userId
                                ? 'Updating…'
                                : isActive
                                  ? 'Deactivate'
                                  : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemove(user)}
                              disabled={busyId === user.userId}
                              className="text-[0.8125rem] font-bold disabled:opacity-50"
                              style={{ color: NAVY }}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
