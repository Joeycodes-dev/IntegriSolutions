import { useEffect, useMemo, useState } from 'react';
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

  const summary = useMemo(() => {
    const total = tests.length;
    const fails = tests.filter((test) => test.result === 'fail').length;
    const zeroPass = tests.filter((test) => test.result === 'pass' && test.bacReading === 0).length;
    const avgBac = fails
      ? tests
          .filter((test) => test.result === 'fail')
          .reduce((sum, test) => sum + test.bacReading, 0) / fails
      : 0;

    return {
      total,
      fails,
      zeroPass,
      duiRate: total ? Math.round((fails / total) * 100) : 0,
      avgBac: avgBac.toFixed(3),
      auditBacklog: Math.max(0, fails - 4)
    };
  }, [tests]);

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-3xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/15 flex items-center justify-center text-lg font-black">IS</div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-indigo-600">IntegriScan Command</p>
            <p className="text-xl font-bold text-slate-950">Supervisor Enforcement View</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Signed in as</span>
            <span className="text-sm font-bold text-slate-900">{profile.name}</span>
          </div>
          <button
            onClick={signOut}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 transition hover:border-rose-300 hover:text-rose-600"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-8xl mx-auto p-8 grid grid-cols-12 gap-8">
        <section className="col-span-12 xl:col-span-8 space-y-8">
          <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-700 p-8 text-white shadow-2xl shadow-indigo-950/20">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm uppercase tracking-[0.35em] text-indigo-300 font-semibold">Operational intelligence</p>
                <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Metro DUI Enforcement Dashboard</h1>
                <p className="mt-4 max-w-xl text-slate-200 leading-7">
                  Command your busiest shift with quick insights into field activity, DUI arrests, and enforcement health across the entire department.
                </p>
              </div>
              <div className="rounded-[32px] border border-white/15 bg-white/10 p-5 shadow-lg shadow-slate-950/10">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-300">Live incident score</p>
                <p className="mt-4 text-3xl font-bold">{summary.duiRate}%</p>
                <p className="mt-2 text-sm text-slate-300">DUI fail rate this shift</p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-3xl bg-white/10 p-6 border border-white/15">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Roadside stops</p>
                <p className="mt-4 text-4xl font-bold">{summary.total}</p>
                <p className="mt-2 text-sm text-slate-300">Complete roadside test sessions.</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-6 border border-white/15">
                <p className="text-xs uppercase tracking-[0.3em] text-rose-200">DUI arrests</p>
                <p className="mt-4 text-4xl font-bold text-rose-100">{summary.fails}</p>
                <p className="mt-2 text-sm text-rose-200">Confirmed failed BAC readings.</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-6 border border-white/15">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Zero BAC</p>
                <p className="mt-4 text-4xl font-bold text-emerald-100">{summary.zeroPass}</p>
                <p className="mt-2 text-sm text-emerald-200">Clean pass inspections.</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-6 border border-white/15">
                <p className="text-xs uppercase tracking-[0.3em] text-indigo-200">Avg BAC</p>
                <p className="mt-4 text-4xl font-bold text-indigo-100">{summary.avgBac}</p>
                <p className="mt-2 text-sm text-indigo-200">Average BAC for DUI cases.</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Shift review log</p>
                <p className="mt-1 text-sm text-slate-500">Latest DUI enforcement activity and case details.</p>
              </div>
              <button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
                <FileText size={16} /> Export shift report
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.26em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Time</th>
                    <th className="px-6 py-4">Officer</th>
                    <th className="px-6 py-4">Driver</th>
                    <th className="px-6 py-4">BAC</th>
                    <th className="px-6 py-4">Result</th>
                    <th className="px-6 py-4">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {tests.map((test) => (
                    <tr key={test.id} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{new Date(test.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{test.officerName}</div>
                        <div className="text-[11px] text-slate-400 uppercase tracking-[0.18em] mt-1">#{test.badgeNumber}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{test.driverName}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-1">{test.driverId}</div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{test.bacReading.toFixed(3)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${test.result === 'fail' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                          {test.result === 'fail' ? 'DUI' : 'PASS'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <ShieldCheck size={14} className="text-emerald-500" />
                          {test.id.slice(0, 8).toUpperCase()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="col-span-12 xl:col-span-4 space-y-6">
          <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Action center</p>
                <h2 className="mt-3 text-2xl font-bold text-slate-950">Rapid enforcement control</h2>
              </div>
              <div className="rounded-3xl bg-indigo-100 p-3 text-indigo-700">
                <Activity size={22} />
              </div>
            </div>
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400 font-semibold">Patrol squads</p>
                <p className="mt-3 text-3xl font-bold text-slate-950">12 active</p>
                <p className="mt-2 text-sm text-slate-500">Coverage across all precinct sectors.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400 font-semibold">Audit backlog</p>
                <p className="mt-3 text-3xl font-bold text-slate-950">{summary.auditBacklog}</p>
                <p className="mt-2 text-sm text-slate-500">High-risk cases queued for review.</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-indigo-950 text-white p-6 shadow-2xl shadow-indigo-950/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-indigo-300 font-semibold">Command briefing</p>
                <h2 className="mt-4 text-2xl font-bold tracking-tight">Risk escalation</h2>
              </div>
              <div className="rounded-3xl bg-indigo-700 p-3 shadow-lg shadow-black/20">
                <AlertCircle size={24} className="text-rose-300" />
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-3xl bg-white/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-300">DUI alerts</p>
                <p className="mt-3 text-3xl font-bold text-white">{summary.fails}</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-300">Avg. BAC</p>
                <p className="mt-3 text-3xl font-bold text-white">{summary.avgBac}</p>
              </div>
            </div>
            <button className="mt-8 w-full rounded-3xl border border-white/20 bg-white/10 px-5 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-white/20">
              Review priority incidents
            </button>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Quick actions</h3>
            <div className="mt-5 space-y-3">
              <button className="w-full rounded-2xl border border-slate-200 px-5 py-4 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 transition">
                <div className="flex items-center justify-between gap-4">
                  <span>Generate enforcement brief</span>
                  <Activity size={18} className="text-indigo-600" />
                </div>
              </button>
              <button className="w-full rounded-2xl border border-slate-200 px-5 py-4 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 transition">
                <div className="flex items-center justify-between gap-4">
                  <span>Search driver records</span>
                  <Search size={18} className="text-indigo-600" />
                </div>
              </button>
              <button className="w-full rounded-2xl border border-slate-200 px-5 py-4 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 transition">
                <div className="flex items-center justify-between gap-4">
                  <span>Flag a priority case</span>
                  <AlertCircle size={18} className="text-rose-500" />
                </div>
              </button>
            </div>
          </div>
        </aside>
      </main>

      <footer className="max-w-7xl mx-auto px-8 py-6 flex flex-col gap-3 text-slate-500 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-xs uppercase tracking-[0.24em] font-semibold">Command node: Metro Enforcement 03</span>
        </div>
        <div className="text-xs uppercase tracking-[0.24em] font-semibold">© 2026 Integri Solutions</div>
      </footer>
    </div>
  );
}
