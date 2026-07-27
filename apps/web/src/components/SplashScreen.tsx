import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

const FADE_OUT_MS = import.meta.env.VITEST ? 0 : 500;

interface SplashScreenProps {
  onComplete: () => void;
  /** When true, auth/bootstrap is done and splash may exit after min duration. */
  ready?: boolean;
  minDurationMs?: number;
}

export function SplashScreen({
  onComplete,
  ready = true,
  minDurationMs = 2200
}: SplashScreenProps) {
  const [minElapsed, setMinElapsed] = useState(minDurationMs === 0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (minDurationMs === 0) return;
    const timer = window.setTimeout(() => setMinElapsed(true), minDurationMs);
    return () => window.clearTimeout(timer);
  }, [minDurationMs]);

  useEffect(() => {
    if (minElapsed && ready && !exiting) {
      setExiting(true);
    }
  }, [minElapsed, ready, exiting]);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(onComplete, FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, onComplete]);

  return (
    <motion.div
      role="status"
      aria-label="Loading IntegriScan"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1524]"
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: FADE_OUT_MS / 1000, ease: 'easeInOut' }}
    >
      <motion.h1
        className="text-4xl font-semibold tracking-tight select-none sm:text-5xl"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <span className="text-white">Integri</span>
        <span className="text-[#5eb3ff]">Scan</span>
      </motion.h1>
    </motion.div>
  );
}
