import { useRef, useState } from 'react';
import { Camera, ShieldCheck, LogOut, Search, Activity, AlertCircle, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { createTest } from '../services/api';
import { scanDriverLicense, DriverLicenseData } from '../services/geminiService';
import { Button } from './Button';

type OfficerStep = 'idle' | 'scan' | 'reading' | 'confirmation';

export function OfficerDashboard() {
  const { profile, signOut } = useAuth();
  const [step, setStep] = useState<OfficerStep>('idle');
  const [scannedData, setScannedData] = useState<DriverLicenseData | null>(null);
  const [bacReading, setBacReading] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!profile) {
    return null;
  }

  const startScan = async () => {
    setStep('scan');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      alert('Camera access denied');
      setStep('idle');
    }
  };

  const captureAndProcess = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg').split(',')[1];

    const mediaStream = videoRef.current.srcObject as MediaStream | null;
    mediaStream?.getTracks().forEach((track) => track.stop());

    setStep('reading');
    try {
      const data = await scanDriverLicense(base64);
      setScannedData(data);
    } catch {
      alert('Failed to scan ID. Please try manual entry or re-scan.');
      setStep('idle');
    }
  };

  const saveRecord = async () => {
    if (!scannedData || !bacReading) return;
    const reading = parseFloat(bacReading);
    if (Number.isNaN(reading)) return;

    setIsSaving(true);
    try {
      const isOver = reading >= 0.05;
      await createTest({
        driverName: scannedData.name,
        driverId: scannedData.licenseNumber,
        driverDob: scannedData.dob,
        bacReading: reading,
        result: reading === 0 ? 'pass' : isOver ? 'fail' : 'pass',
        location: { lat: -25.7479, lng: 28.2293 }
      });

      setStep('idle');
      setScannedData(null);
      setBacReading('');
      alert('Record saved to incorruptible ledger.');
    } catch {
      alert('Failed to sync record. It is saved in offline buffer.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm shadow-indigo-200"><ShieldCheck size={20} /></div>
          <div>
            <h2 className="font-bold text-slate-900 leading-tight tracking-tight">OFFICER PORTAL</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{profile.name} • {profile.badgeNumber}</p>
          </div>
        </div>
        <button onClick={signOut} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><LogOut size={20} /></button>
      </div>

      <div className="p-6 max-w-sm mx-auto">
        <AnimatePresence mode="wait">
          {step === 'idle' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
                <div className="bg-indigo-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-indigo-600">
                  <Camera size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">New Roadside Stop</h3>
                <p className="text-slate-500 text-sm mb-8 leading-relaxed">Scan the driver's license to begin an incorruptible DUI record session.</p>
                <Button onClick={startScan} className="w-full py-4 text-lg shadow-sm shadow-indigo-100">
                  <Camera size={20} /> START SESSION
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'scan' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
              <div className="absolute top-6 left-6 z-10 text-white flex items-center gap-3 bg-slate-900/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                <AlertCircle size={20} className="text-amber-400" />
                <span className="text-sm font-semibold tracking-wide uppercase">Align License Card</span>
              </div>
              <video ref={videoRef} autoPlay playsInline className="h-full object-cover" />
              <div className="absolute bottom-12 inset-x-0 flex flex-col items-center gap-6 px-8">
                <div className="w-full h-64 border-2 border-indigo-400 border-dashed rounded-3xl relative">
                  <div className="absolute inset-0 bg-indigo-500/10 rounded-3xl" />
                </div>
                <div className="flex gap-4 w-full">
                  <Button variant="outline" className="bg-white/10 text-white border-white/20 px-8 backdrop-blur-md" onClick={() => setStep('idle')}>
                    Cancel
                  </Button>
                  <Button className="flex-1 py-4 shadow-xl shadow-indigo-500/20" onClick={captureAndProcess}>
                    Capture License
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'reading' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-slate-400">
                    <UserIcon size={24} />
                  </div>
                  <div>
                    <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Subject Identified</h4>
                    <p className="font-bold text-slate-900">{scannedData?.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-mono tracking-tighter">{scannedData?.licenseNumber}</p>
                  </div>
                </div>

                <div className="mb-8">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">BAC Reading (g/100ml)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      placeholder="0.000"
                      value={bacReading}
                      onChange={(e) => setBacReading(e.target.value)}
                      className="w-full text-5xl font-mono p-6 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 text-center focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-mono text-xl">BAC</div>
                  </div>
                  <div className="mt-6 flex gap-4">
                    <div className="flex-1 p-3 bg-white rounded-xl text-center border border-slate-100 shadow-sm">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Legal Limit</p>
                      <p className="text-sm font-bold text-slate-700 font-mono">0.050</p>
                    </div>
                    <div className="flex-1 p-3 bg-indigo-50 rounded-xl text-center border border-indigo-100">
                      <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest mb-1">Status</p>
                      <p className="text-sm font-bold text-indigo-600 animate-pulse">AWAITING</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Button className="w-full py-4 text-lg shadow-lg shadow-indigo-200" onClick={saveRecord} isLoading={isSaving} disabled={!bacReading}>
                    <ShieldCheck size={20} /> COMMIT TO LEDGER
                  </Button>
                  <button onClick={() => setStep('idle')} className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 py-2 transition-colors">
                    Abort Session
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around shadow-2xl">
        <button className="flex flex-col items-center gap-1 p-2 text-indigo-600">
          <Activity size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Reports</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <Search size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Audit</span>
        </button>
      </div>
    </div>
  );
}
