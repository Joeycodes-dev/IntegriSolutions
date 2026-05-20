import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { ROLE_ADMIN, ROLE_SUPERVISOR } from '../../lib/roles';

const NAVY = '#0D2137';
const BORDER = '#D1D5DB';

const fieldClassName =
  'h-[34px] w-full rounded-lg border border-[#D1D5DB] bg-white px-2.5 text-[0.8125rem] text-slate-800 outline-none focus:border-[#0D2137]/40 focus:ring-1 focus:ring-[#0D2137]/15';

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    email: string;
    password: string;
    name: string;
    surname: string;
    roleId: number;
    station: string;
    status: string;
  }) => Promise<void>;
}

function splitFullName(fullName: string): { name: string; surname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: '', surname: '' };
  if (parts.length === 1) return { name: parts[0], surname: '-' };
  return { name: parts[0], surname: parts.slice(1).join(' ') };
}

export function AddUserModal({ open, onClose, onSubmit }: AddUserModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<number>(ROLE_SUPERVISOR);
  const [station, setStation] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('Active');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { name, surname } = splitFullName(fullName);
    if (!name || !email || !password || !station) {
      setError('Please complete all required fields.');
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({ email, password, name, surname, roleId, station, status });
      setFullName('');
      setEmail('');
      setRoleId(ROLE_SUPERVISOR);
      setStation('');
      setPassword('');
      setStatus('Active');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-xl"
        style={{ borderColor: BORDER }}
        role="dialog"
        aria-labelledby="add-user-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-user-title" className="text-[0.9375rem] font-bold" style={{ color: NAVY }}>
            Add New User
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-600">Full Name</span>
            <input
              className={fieldClassName}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nomsa Dlamini"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-600">Work Email</span>
            <input
              type="email"
              className={fieldClassName}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="supervisor@integriscan.co.za"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-600">Role</span>
            <select
              className={fieldClassName}
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
            >
              <option value={ROLE_SUPERVISOR}>Supervisor</option>
              <option value={ROLE_ADMIN}>Admin</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-600">Station</span>
            <input
              className={fieldClassName}
              value={station}
              onChange={(e) => setStation(e.target.value)}
              placeholder="Johannesburg Central"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-600">Temporary Password</span>
            <input
              type="password"
              className={fieldClassName}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create password"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-600">Status</span>
            <select
              className={fieldClassName}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
            </select>
          </label>

          {error && <p className="text-[11px] text-rose-600">{error}</p>}

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border py-2 text-[0.8125rem] font-semibold text-slate-600"
              style={{ borderColor: BORDER }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-full py-2 text-[0.8125rem] font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: NAVY }}
            >
              {isLoading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
