import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const NAVY = '#0D2137';

export function PortalAccessDenied() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef1f5] px-4">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <div
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: NAVY }}
        >
          <ShieldCheck size={22} />
        </div>
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>
          Access not available
        </h1>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-slate-500">
          Traffic officers must use the IntegriScan mobile app. This portal is for supervisors and
          administrators only.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-5 w-full rounded-full py-2.5 text-[0.8125rem] font-bold text-white"
          style={{ backgroundColor: NAVY }}
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
