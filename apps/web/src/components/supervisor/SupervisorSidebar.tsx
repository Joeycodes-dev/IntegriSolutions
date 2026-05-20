import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Shield,
  User
} from 'lucide-react';
import type { SupervisorNavItem } from '../../types';

const NAVY_SIDEBAR = '#0D2137';
const ACTIVE_ACCENT = '#38BDF8';

const NAV_ITEMS: { id: SupervisorNavItem; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'logs', label: 'Logs', icon: ClipboardList },
  { id: 'officers', label: 'Officers', icon: User },
  { id: 'reports', label: 'Reports', icon: BarChart3 }
];

interface SupervisorSidebarProps {
  active: SupervisorNavItem;
  onNavigate: (item: SupervisorNavItem) => void;
  onLogout: () => void;
}

export function SupervisorSidebar({ active, onNavigate, onLogout }: SupervisorSidebarProps) {
  return (
    <aside
      className="flex h-screen w-[200px] shrink-0 flex-col px-3 py-4"
      style={{ backgroundColor: NAVY_SIDEBAR }}
    >
      <div className="rounded-lg border border-white/10 bg-white/10 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/20">
            <Shield size={15} className="text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[0.75rem] font-bold leading-tight text-white">IntegriScan</p>
            <p className="text-[10px] text-slate-400">Command Center</p>
          </div>
        </div>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-0.5" aria-label="Supervisor navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.75rem] font-medium transition ${
                isActive
                  ? 'bg-white/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              style={isActive ? { color: ACTIVE_ACCENT } : undefined}
            >
              <Icon size={14} strokeWidth={2} />
              {label}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onLogout}
        className="mt-auto flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
      >
        <LogOut size={14} strokeWidth={2} />
        Logout
      </button>
    </aside>
  );
}
