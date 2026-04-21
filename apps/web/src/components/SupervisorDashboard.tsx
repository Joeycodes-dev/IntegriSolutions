import { useEffect, useState } from 'react';
import { LogOut, FileText, User as UserIcon, Activity, Search, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { getTests } from '../services/api';
import type { TestRecord } from '../types';

export function SupervisorDashboard() {
  const { profile, signOut } = useAuth();
  const [tests, setTests] = useState<TestRecord[]>([]);

  useEffect(() => {
    const loadTests = async () => {
      try {
        const tests = await getTests();
        setTests(tests as TestRecord[]);
      } catch (error) {
        console.error('Failed to load tests:', error instanceof Error ? error.message : 'Unknown error');
      }
    };

    void loadTests();
  }, []);

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">IS</div>
          <span className="text-xl font-semibold tracking-tight text-slate-800">Integri<span className="text-indigo-600">Scan</span></span>
        </div>
        <nav className="hidden md:flex gap-8 h-full">
          <a href="#" className="flex items-center text-sm font-medium text-indigo-600 border-b-2 border-indigo-600 h-full">Dashboard</a>
          <a href="#" className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors h-full">Ledger</a>
          <a href="#" className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors h-full">Map View</a>
          <a href="#" className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors h-full">Settings</a>
        </nav>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-900 leading-none">{profile.name}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Supervisor</p>
          </div>
          <button onClick={signOut} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 grid grid-cols-12 gap-8 items-start">
        <section className="col-span-12 lg:col-span-8 flex flex-col gap-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-3xl font-bold text-slate-950 tracking-tight">Shift Operations Dashboard</h2>
                <p className="text-slate-500 text-sm mt-2 font-medium">Real-time roadside DUI enforcement monitoring.</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ledger Health</span>
                <div className="text-3xl font-mono text-indigo-600 font-bold">100%</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Tests</p>
                <div className="flex items-end gap-2">
                  <p className="text-4xl font-bold text-slate-900">{tests.length}</p>
                  <Activity size={24} className="text-indigo-200 mb-1" />
                </div>
              </div>
              <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Failed (DUI)</p>
                <p className="text-4xl font-bold text-rose-600">{tests.filter((t) => t.result === 'fail').length}</p>
              </div>
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Clean Passes</p>
                <p className="text-4xl font-bold text-emerald-600">{tests.filter((t) => t.result === 'pass' && t.bacReading === 0).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText size={18} className="text-indigo-600" />
                Incorruptible Shift Ledger
              </h3>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Live Audit Stream</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] bg-slate-50/30">
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">Officer</th>
                    <th className="px-6 py-4">Subject</th>
                    <th className="px-6 py-4">Reading</th>
                    <th className="px-6 py-4 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tests.map((test) => (
                    <tr key={test.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500 font-mono">
                        {new Date(test.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                            <UserIcon size={14} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800 leading-none">{test.officerName}</span>
                            <span className="text-[9px] text-slate-400 font-bold uppercase mt-1">{test.badgeNumber}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">{test.driverName}</span>
                          <span className="text-[9px] text-slate-400 font-mono tracking-tighter">{test.driverId}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md font-mono text-[11px] font-black ${test.result === 'fail' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                          {test.bacReading.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <code className="text-[9px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded font-mono">{test.id.slice(0, 8)}</code>
                          <ShieldCheck size={14} className="text-emerald-500" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-indigo-900 text-white rounded-2xl p-8 shadow-xl shadow-indigo-200">
            <h3 className="text-lg font-bold mb-6 tracking-tight flex items-center justify-between">
              Infrastructure Status
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            </h3>
            <div className="space-y-5">
              <div className="flex justify-between items-center group">
                <span className="text-indigo-200 text-xs font-semibold group-hover:text-white transition-colors">Encrypted Ledger</span>
                <span className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">HEALTHY</span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-indigo-200 text-xs font-semibold group-hover:text-white transition-colors">Gemini AI Service</span>
                <span className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">ACTIVE</span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-indigo-200 text-xs font-semibold group-hover:text-white transition-colors">Auth Terminal</span>
                <span className="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest">SYNCING</span>
              </div>
            </div>
            <button className="w-full mt-8 py-3 bg-indigo-800 hover:bg-indigo-700 active:scale-95 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
              Rotate Security Keys
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 rounded-2xl group transition-all">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                  <Activity size={20} />
                </div>
                <span className="text-sm font-bold text-slate-700">Generate Shift Report</span>
              </button>
              <button className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 rounded-2xl group transition-all">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                  <Search size={20} />
                </div>
                <span className="text-sm font-bold text-slate-700">Search Driver History</span>
              </button>
              <button className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 rounded-2xl group transition-all">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                  <AlertCircle size={20} />
                </div>
                <span className="text-sm font-bold text-slate-700">Flag Incident</span>
              </button>
            </div>
          </div>
        </aside>
      </main>

      <footer className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between text-slate-400">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Instance: IS-SA-PROD-01</span>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest">&copy; 2026 Integri Solutions • v1.0.4-stable</div>
      </footer>
    </div>
  );
}
