import { useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { createPortalUser, getAccessToken } from '../../services/api';
import { ROLE_SUPERVISOR } from '../../lib/roles';
import type { PortalUser } from '../../types';

const NAVY = '#0D2137';
const PAGE_BG = '#F8FAFC';
const BORDER = '#E2E8F0';
const LABEL = '#334155';

const RANKS = [
  'Constable',
  'Sergeant',
  'Warrant Officer',
  'Captain',
  'Lieutenant',
  'Major',
  'Colonel'
] as const;

const fieldClassName =
  'h-[38px] w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[0.8125rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/40 focus:ring-1 focus:ring-[#0D2137]/15';

interface AddSupervisorProps {
  onBack: () => void;
  onCreated: (user: PortalUser) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold" style={{ color: LABEL }}>
      {children}
    </span>
  );
}

export function AddSupervisor({ onBack, onCreated }: AddSupervisorProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [serviceNumber, setServiceNumber] = useState('');
  const [rank, setRank] = useState<string>(RANKS[0]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !email || !serviceNumber || !branch) {
      setError('Please complete all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (!getAccessToken()) {
      setError(
        'Not signed in to the API. Log out, turn off Dev Bypass on login, and sign in with your admin email and password.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const phoneDigits = phone.replace(/\D/g, '');
      const serviceDigits = serviceNumber.replace(/\D/g, '');
      const idNumber =
        phoneDigits.length >= 10
          ? phoneDigits.slice(-13)
          : serviceDigits.length >= 6
            ? serviceDigits.padStart(13, '0').slice(-13)
            : `${Date.now()}`.slice(-13);

      const created = await createPortalUser({
        email,
        password,
        name: firstName.trim(),
        surname: lastName.trim(),
        roleId: ROLE_SUPERVISOR,
        station: branch.trim(),
        status: 'Active',
        serviceNumber: serviceNumber.trim(),
        rank,
        phone: phone.trim(),
        idNumber
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add supervisor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col px-6 py-8" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto w-full max-w-[640px]">
        <div className="rounded-2xl border bg-white px-6 py-6 shadow-sm" style={{ borderColor: BORDER }}>
          <div className="mb-6 flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Back to user management"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
            <div>
              <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
                Add New Supervisor
              </h1>
              <p className="mt-1 text-[0.8125rem] text-slate-500">
                Enter the officer details below to add them to the command system.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <FieldLabel>First Name</FieldLabel>
                <input
                  className={fieldClassName}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Nomsa"
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Last Name</FieldLabel>
                <input
                  className={fieldClassName}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Dlamini"
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Service number</FieldLabel>
                <input
                  className={fieldClassName}
                  value={serviceNumber}
                  onChange={(e) => setServiceNumber(e.target.value)}
                  placeholder="SA-TRF-1440"
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Rank</FieldLabel>
                <div className="relative">
                  <select
                    className={`${fieldClassName} appearance-none pr-9`}
                    value={rank}
                    onChange={(e) => setRank(e.target.value)}
                  >
                    {RANKS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Email</FieldLabel>
                <input
                  type="email"
                  className={fieldClassName}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="supervisor@integriscan.co.za"
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Phone Number</FieldLabel>
                <input
                  type="tel"
                  className={fieldClassName}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+27 82 000 0000"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <FieldLabel>Branch</FieldLabel>
              <input
                className={fieldClassName}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Johannesburg Central"
                required
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Create Password</FieldLabel>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`${fieldClassName} pr-10`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Confirm Password</FieldLabel>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className={`${fieldClassName} pr-10`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            </div>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.8125rem] text-rose-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-xl py-3 text-[0.8125rem] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
              style={{ backgroundColor: NAVY }}
            >
              {isLoading ? 'Adding supervisor…' : 'Add Supervisor'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
