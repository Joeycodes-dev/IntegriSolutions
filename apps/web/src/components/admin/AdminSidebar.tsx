import { FileText, LogOut, Settings, Shield, Users } from 'lucide-react';
import type { AdminNavItem } from '../../types';

const NAVY_SIDEBAR = '#0F172A';
const ACTIVE_ACCENT = '#38BDF8';

const NAV_ITEMS: { id: AdminNavItem; label: string; icon: typeof Users }[] = [
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'audit', label: 'Audit Log', icon: FileText },
  { id: 'config', label: 'System Configuration', icon: Settings }
];

interface AdminSidebarProps {
  active: AdminNavItem;
  onNavigate: (item: AdminNavItem) => void;
  onLogout: () => void;
}

export function AdminSidebar({ active, onNavigate, onLogout }: AdminSidebarProps) {
  return (
    <aside
      className="flex h-screen w-[220px] shrink-0 flex-col px-4 py-5"
      style={{ backgroundColor: NAVY_SIDEBAR }}
    >
      <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20">
            <Shield size={18} className="text-white" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[0.8125rem] font-bold leading-tight text-white">IntegriScan</p>
            <p className="text-[11px] text-slate-400">Admin</p>
          </div>
        </div>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Admin navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[0.8125rem] font-medium transition ${
                isActive
                  ? 'bg-white/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              style={isActive ? { color: ACTIVE_ACCENT } : undefined}
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onLogout}
        className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.8125rem] font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
      >
        <LogOut size={16} strokeWidth={2} />
        Logout
      </button>
    </aside>
  );
}
