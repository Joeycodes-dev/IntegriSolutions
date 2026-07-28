import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { clearAccessToken, login } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { canAccessWebPortal, ROLE_SUPERVISOR } from '../lib/roles';
import type { UserProfile } from '../types';

const NAVY = '#0D2137';
const ACCENT = '#5B9BD5';
const LABEL = '#4B5563';
const BORDER = '#D1D5DB';
const PAGE_BG = '#EEF1F5';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { signIn, signInLocal } = useAuth();

  const ensurePortalAccess = (profile: UserProfile) => {
    if (!canAccessWebPortal(profile.roleId)) {
      clearAccessToken();
      throw new Error(
        'This portal is for supervisors and administrators. Officers must use the mobile app.'
      );
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (devMode) {
        const profile: UserProfile = {
          uid: `local-${Date.now()}`,
          email,
          name: email.split('@')[0] || 'Supervisor',
          surname: '',
          badgeNumber: '0000',
          idNumber: '0000000000000',
          employmentStatus: 'Active',
          province: 'Gauteng',
          region: 'Johannesburg',
          officerTypeId: 1,
          roleId: ROLE_SUPERVISOR,
          createdAt: new Date().toISOString()
        };
        ensurePortalAccess(profile);
        signInLocal(profile);
        return;
      }

      const response = await login(email, password);
      if (response.session?.access_token && response.profile) {
        const profile = response.profile as UserProfile;
        ensurePortalAccess(profile);
        signIn(profile, response.session.access_token);
        return;
      }
      throw new Error('Login failed.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-6 font-sans antialiased"
      style={{ backgroundColor: PAGE_BG }}
    >
      <div
        className="w-full max-w-[318px] overflow-y-auto rounded-2xl border bg-white px-6 py-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ borderColor: BORDER }}
      >
        <header className="flex flex-col items-center text-center">
          <div
            className="mb-3 flex h-11 w-11 items-center justify-center rounded-[10px] text-white"
            style={{ backgroundColor: NAVY }}
          >
            <ShieldCheck size={22} strokeWidth={2} />
          </div>
          <h1 className="text-[1.25rem] font-bold leading-tight tracking-tight" style={{ color: NAVY }}>
            IntegriScan
          </h1>
          <p className="mt-1 text-[0.8125rem] font-normal leading-snug" style={{ color: LABEL }}>
            Welcome Back !!
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-[10px]">
          <AuthField label="Work Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="supervisor@integriscan.co.za"
              className={fieldClassName}
              autoComplete="username"
              aria-label="Work Email"
              required
            />
          </AuthField>

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            placeholder="Enter password"
            autoComplete="current-password"
          />

          {import.meta.env.DEV && (
            <label className="flex items-center gap-2 pt-0.5 text-[11px] text-slate-500">
              <input
                type="checkbox"
                checked={devMode}
                onChange={(e) => setDevMode(e.target.checked)}
                className="h-3 w-3 rounded border-slate-300"
                style={{ accentColor: NAVY }}
              />
              Developer bypass login
            </label>
          )}

          <p className="pt-0.5 text-center text-[10px] leading-relaxed text-slate-500">
            Admins add supervisors. Supervisors add officers. Accounts are not self-registered.
          </p>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-4 w-full rounded-full py-2.5 text-[0.8125rem] font-bold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: NAVY }}
          >
            {isLoading ? 'Please wait…' : 'Login'}
          </button>

          <p className="mt-1 text-center text-[10px] leading-[1.45] text-slate-500">
            Need access? Ask your administrator.{' '}
            <a href="#" className="underline" style={{ color: ACCENT }} onClick={(e) => e.preventDefault()}>
              Support
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

const fieldClassName =
  'h-[34px] w-full appearance-none rounded-lg border border-[#D1D5DB] bg-white px-2.5 text-[0.8125rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/40 focus:ring-1 focus:ring-[#0D2137]/15';

function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold leading-none" style={{ color: LABEL }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  autoComplete
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <AuthField label={label}>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${fieldClassName} pr-8`}
          style={{ borderColor: BORDER }}
          autoComplete={autoComplete}
          aria-label={label}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </AuthField>
  );
}
