import { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import type { AdminNavItem } from '../../types';
import { AdminSidebar } from './AdminSidebar';
import { AuditLog } from './AuditLog';
import { SystemConfiguration } from './SystemConfiguration';
import { UserManagement } from './UserManagement';

export function AdminDashboard() {
  const { signOut } = useAuth();
  const [activeNav, setActiveNav] = useState<AdminNavItem>('users');

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        active={activeNav}
        onNavigate={setActiveNav}
        onLogout={() => void signOut()}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {activeNav === 'users' && <UserManagement />}
        {activeNav === 'audit' && <AuditLog />}
        {activeNav === 'config' && <SystemConfiguration />}
      </main>
    </div>
  );
}
