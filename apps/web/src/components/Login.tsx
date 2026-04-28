import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { login, register } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { Button } from './Button';
import { Input } from './Input';
import type { UserRole, UserProfile } from '../types';

export function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [badge, setBadge] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [role, setRole] = useState<UserRole>('supervisor');
  const [isLoading, setIsLoading] = useState(false);

  const { signIn, signInLocal } = useAuth();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (devMode) {
        const profile: UserProfile = {
          uid: `local-${Date.now()}`,
          email,
          name: isLogin ? email.split('@')[0] : name,
          badgeNumber: isLogin ? '0000' : badge,
          role: isLogin ? 'supervisor' : role,
          createdAt: new Date().toISOString()
        };

        signInLocal(profile);
        return;
      }

      if (isLogin) {
        const response = await login(email, password);
        if (response.session?.access_token && response.profile) {
          signIn(response.profile as UserProfile, response.session.access_token);
          return;
        }

        throw new Error('Login failed.');
      } else {
        const response = await register(email, password, name, badge, role);
        const token = response.session?.access_token ?? (response.session as any)?.accessToken;
        if (token && response.profile) {
          signIn(response.profile as UserProfile, token);
          return;
        }

        alert('Registration completed. Please log in.');
        setIsLogin(true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Integri<span className="text-indigo-600">Scan</span></h1>
          <p className="text-slate-500 text-sm">Safer Roads, Incorruptible Records</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <>
              <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input label="Badge / ID Number" value={badge} onChange={(e) => setBadge(e.target.value)} required />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${role === 'officer' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-500'} opacity-50 cursor-not-allowed`}
                  >
                    Traffic Officer
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('supervisor')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${role === 'supervisor' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                  >
                    Supervisor
                  </button>
                </div>
              </div>
            </>
          )}

          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

          {import.meta.env.DEV && (
            <label className="flex items-center gap-2 text-sm text-slate-500">
              <input
                type="checkbox"
                checked={devMode}
                onChange={(e) => setDevMode(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Developer bypass login
            </label>
          )}

          <Button type="submit" isLoading={isLoading} className="mt-2 w-full shadow-sm shadow-indigo-200">
            {isLogin ? 'Login to Portal' : 'Register Service Profile'}
          </Button>

          <p className="text-center text-sm text-slate-500">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
            <button type="button" onClick={() => setIsLogin(!isLogin)} className="ml-1 text-indigo-600 font-semibold hover:underline">
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
