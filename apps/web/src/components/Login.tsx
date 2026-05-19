import { useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clearAccessToken, login, register } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { canAccessWebPortal, ROLE_ADMIN, ROLE_SUPERVISOR } from '../lib/roles';
import type { UserProfile } from '../types';

const NAVY = '#0D2137';
const TAB_TRACK = '#D1D9E6';
const ACCENT = '#5B9BD5';
const LABEL = '#4B5563';
const BORDER = '#D1D5DB';
const PAGE_BG = '#EEF1F5';

const ADMIN_REGISTER_ROLES = [{ label: 'Admin', roleId: 3 }] as const;

function splitFullName(fullName: string): { name: string; surname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: '', surname: '' };
  if (parts.length === 1) return { name: parts[0], surname: '-' };
  return { name: parts[0], surname: parts.slice(1).join(' ') };
}

export function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [roleId, setRoleId] = useState<number>(ROLE_ADMIN);
  const [devMode, setDevMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { signIn, signInLocal } = useAuth();

  const switchToLogin = () => setIsLogin(true);
  const switchToRegister = () => {
    setRoleId(ROLE_ADMIN);
    setIsLogin(false);
  };

  const ensurePortalAccess = (profile: UserProfile) => {
    if (!canAccessWebPortal(profile.roleId)) {
      clearAccessToken();
      throw new Error('This portal is for supervisors and administrators. Officers must use the mobile app.');
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
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
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      const { name, surname } = splitFullName(fullName);
      if (!name || !fullName.trim()) {
        throw new Error('Please enter your full name.');
      }

      if (devMode) {
        const profile: UserProfile = {
          uid: `local-${Date.now()}`,
          email,
          name,
          surname,
          badgeNumber: 'ADM-0000',
          idNumber: '0000000000000',
          employmentStatus: 'Active',
          province: 'Gauteng',
          region: 'Johannesburg',
          officerTypeId: 1,
          roleId,
          createdAt: new Date().toISOString()
        };
        ensurePortalAccess(profile);
        signInLocal(profile);
        return;
      }

      const response = await register({
        email,
        password,
        name,
        surname,
        badgeNumber: `ADM-${Date.now().toString(36).slice(-6).toUpperCase()}`,
        idNumber: '0000000000000',
        employmentStatus: 'Active',
        province: 'Gauteng',
        region: 'Johannesburg',
        officerTypeId: 1,
        roleId
      });

      const token = response.session?.access_token;
      if (token && response.profile) {
        const profile = response.profile as UserProfile;
        ensurePortalAccess(profile);
        signIn(profile, token);
        return;
      }

      alert('Account created. Please log in.');
      switchToLogin();
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
            {isLogin ? 'Welcome Back !!' : 'Create Supervisor Portal Account'}
          </p>
        </header>

        <div
          className="mt-5 flex rounded-[10px] border p-1"
          style={{ backgroundColor: TAB_TRACK, borderColor: BORDER }}
          role="tablist"
          aria-label="Authentication mode"
        >
          <TabButton active={isLogin} onClick={switchToLogin}>
            Login
          </TabButton>
          <TabButton active={!isLogin} onClick={switchToRegister}>
            Register
          </TabButton>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col">
          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div
                key="login-fields"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-[10px]"
              >
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
                  Supervisor accounts are provisioned by your administrator.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="register-fields"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-[10px]"
              >
                <AuthField label="Full Name">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nomsa Dlamini"
                    className={fieldClassName}
                    autoComplete="name"
                    required
                  />
                </AuthField>

                <AuthField label="Work Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@integriscan.co.za"
                    className={fieldClassName}
                    autoComplete="email"
                    required
                  />
                </AuthField>

                <AuthField label="Role">
                  <div className="relative">
                    <select
                      value={roleId}
                      onChange={(e) => setRoleId(Number(e.target.value))}
                      className={fieldClassName}
                      aria-label="Role"
                    >
                      {ADMIN_REGISTER_ROLES.map((role) => (
                        <option key={role.roleId} value={role.roleId}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={15}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                  </div>
                </AuthField>

                <div className="grid grid-cols-2 gap-2.5">
                  <PasswordField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                    placeholder="Create password"
                    autoComplete="new-password"
                  />
                  <PasswordField
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    show={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((v) => !v)}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                  />
                </div>

                {import.meta.env.DEV && (
                  <label className="flex items-center gap-2 text-[11px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={devMode}
                      onChange={(e) => setDevMode(e.target.checked)}
                      className="h-3 w-3 rounded border-slate-300"
                      style={{ accentColor: NAVY }}
                    />
                    Developer bypass (skip API)
                  </label>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-4 w-full rounded-full py-2.5 text-[0.8125rem] font-bold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: NAVY }}
          >
            {isLoading ? 'Please wait…' : isLogin ? 'Login' : 'Create Account'}
          </button>

          {!isLogin && (
            <p className="mt-3 text-center text-[10px] leading-[1.45] text-slate-500">
              By continuing, you agree to our{' '}
              <a href="#" className="underline" style={{ color: ACCENT }}>
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="underline" style={{ color: ACCENT }}>
                Privacy Policy
              </a>
              .
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

const fieldClassName =
  'h-[34px] w-full appearance-none rounded-lg border border-[#D1D5DB] bg-white px-2.5 text-[0.8125rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/40 focus:ring-1 focus:ring-[#0D2137]/15';

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex-1 rounded-[8px] py-1.5 text-[0.8125rem] font-semibold transition"
      style={{
        backgroundColor: active ? '#FFFFFF' : TAB_TRACK,
        color: NAVY,
        boxShadow: active ? '0 1px 2px rgba(13, 33, 55, 0.08)' : 'none'
      }}
    >
      {children}
    </button>
  );
}

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
