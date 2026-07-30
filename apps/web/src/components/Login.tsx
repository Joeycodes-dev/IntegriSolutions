import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { clearAccessToken, completeSupervisorInvite, login, register } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { canAccessWebPortal, ROLE_ADMIN, ROLE_SUPERVISOR } from '../lib/roles';
import type { UserProfile } from '../types';

const NAVY = '#0D2137';
const ACCENT = '#5B9BD5';
const LABEL = '#4B5563';
const BORDER = '#D1D5DB';
const PAGE_BG = '#EEF1F5';

type AuthMode = 'login' | 'admin-register' | 'supervisor-invite';

function initialAuthMode(): AuthMode {
  const params = new URLSearchParams(window.location.search);
  return params.get('supervisorInvite') || params.get('inviteType') === 'supervisor'
    ? 'supervisor-invite'
    : 'login';
}

function initialInviteValue(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('supervisorInvite') || params.get('inviteType') === 'supervisor'
    ? window.location.href
    : '';
}

export function Login() {
  const [mode, setMode] = useState<AuthMode>(() => initialAuthMode());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [province, setProvince] = useState('');
  const [region, setRegion] = useState('');
  const [inviteLink, setInviteLink] = useState(() => initialInviteValue());
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const completeSignIn = (response: { session?: { access_token: string }; profile: any }) => {
    if (response.session?.access_token && response.profile) {
      const profile = response.profile as UserProfile;
      ensurePortalAccess(profile);
      signIn(profile, response.session.access_token);
      return true;
    }
    return false;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'login' && devMode) {
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

      if (mode === 'login') {
        const response = await login(email, password);
        if (completeSignIn(response)) return;
        throw new Error('Login failed.');
      }

      if (mode === 'admin-register') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        const response = await register({
          email,
          password,
          name: firstName.trim(),
          surname: lastName.trim(),
          badgeNumber: badgeNumber.trim(),
          idNumber: idNumber.trim(),
          employmentStatus: 'Active',
          province: province.trim(),
          region: region.trim(),
          officerTypeId: 1,
          roleId: ROLE_ADMIN
        });
        if (completeSignIn(response)) return;
        alert('Admin account created. Please log in with the new credentials.');
        setMode('login');
        return;
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      const response = await completeSupervisorInvite({
        invite: inviteLink.trim(),
        password
      });
      if (completeSignIn(response)) {
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      throw new Error('Invite setup failed.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const title =
    mode === 'admin-register'
      ? 'Register Admin'
      : mode === 'supervisor-invite'
        ? 'Supervisor Invite'
        : 'IntegriScan';
  const subtitle =
    mode === 'admin-register'
      ? 'Create an administrator account'
      : mode === 'supervisor-invite'
        ? 'Create your supervisor password'
        : 'Welcome Back !!';
  const submitLabel =
    mode === 'admin-register'
      ? 'Register Admin'
      : mode === 'supervisor-invite'
        ? 'Complete Invite'
        : 'Login';

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-6 font-sans antialiased"
      style={{ backgroundColor: PAGE_BG }}
    >
      <div
        className="w-full max-w-[378px] overflow-y-auto rounded-2xl border bg-white px-6 py-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
            {title}
          </h1>
          <p className="mt-1 text-[0.8125rem] font-normal leading-snug" style={{ color: LABEL }}>
            {subtitle}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-[10px]">
          {mode === 'supervisor-invite' && (
            <AuthField label="Invite Link">
              <textarea
                value={inviteLink}
                onChange={(e) => setInviteLink(e.target.value)}
                placeholder="Paste supervisor invite link"
                className={`${fieldClassName} min-h-[68px] resize-y py-2`}
                aria-label="Invite Link"
                required
              />
            </AuthField>
          )}

          {mode === 'admin-register' && (
            <div className="grid grid-cols-2 gap-2">
              <AuthField label="First Name">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Admin"
                  className={fieldClassName}
                  aria-label="First Name"
                  required
                />
              </AuthField>
              <AuthField label="Last Name">
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="User"
                  className={fieldClassName}
                  aria-label="Last Name"
                  required
                />
              </AuthField>
            </div>
          )}

          {mode !== 'supervisor-invite' && (
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
          )}

          {mode === 'admin-register' && (
            <div className="grid grid-cols-2 gap-2">
              <AuthField label="Badge Number">
                <input
                  value={badgeNumber}
                  onChange={(e) => setBadgeNumber(e.target.value)}
                  placeholder="ADM-001"
                  className={fieldClassName}
                  aria-label="Badge Number"
                  required
                />
              </AuthField>
              <AuthField label="ID Number">
                <input
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="9001015009087"
                  className={fieldClassName}
                  aria-label="ID Number"
                  required
                />
              </AuthField>
            </div>
          )}

          {mode === 'admin-register' && (
            <div className="grid grid-cols-2 gap-2">
              <AuthField label="Province">
                <input
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="Gauteng"
                  className={fieldClassName}
                  aria-label="Province"
                  required
                />
              </AuthField>
              <AuthField label="Region">
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Johannesburg"
                  className={fieldClassName}
                  aria-label="Region"
                  required
                />
              </AuthField>
            </div>
          )}

          <PasswordField
            label={mode === 'login' ? 'Password' : 'New Password'}
            value={password}
            onChange={setPassword}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            placeholder={mode === 'login' ? 'Enter password' : 'Create password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {mode !== 'login' && (
            <PasswordField
              label="Confirm Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
              placeholder="Confirm password"
              autoComplete="new-password"
            />
          )}

          {mode === 'login' && import.meta.env.DEV && (
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

          {mode === 'login' && (
            <p className="pt-0.5 text-center text-[10px] leading-relaxed text-slate-500">
              Admins can register here. Admins add supervisors. Supervisors add officers.
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-4 w-full rounded-full py-2.5 text-[0.8125rem] font-bold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: NAVY }}
          >
            {isLoading ? 'Please wait…' : submitLabel}
          </button>

          <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-[10px] leading-[1.45] text-slate-500">
            {mode !== 'login' ? (
              <button
                type="button"
                className="underline"
                style={{ color: ACCENT }}
                onClick={() => switchMode('login')}
              >
                Back to login
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="underline"
                  style={{ color: ACCENT }}
                  onClick={() => switchMode('admin-register')}
                >
                  Register admin
                </button>
                <button
                  type="button"
                  className="underline"
                  style={{ color: ACCENT }}
                  onClick={() => switchMode('supervisor-invite')}
                >
                  Use supervisor invite
                </button>
              </>
            )}
          </div>
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
