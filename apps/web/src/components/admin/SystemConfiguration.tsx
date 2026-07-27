import { useCallback, useEffect, useState } from 'react';
import { getSystemSettings } from '../../services/api';
import type { SystemConfigCard } from '../../types';

const NAVY = '#0D2137';
const PAGE_BG = '#F1F5F9';
const BORDER = '#E2E8F0';

export function SystemConfiguration() {
  const [cards, setCards] = useState<SystemConfigCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSystemSettings();
      setCards(data.cards);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system configuration');
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="flex min-h-screen flex-1 flex-col" style={{ backgroundColor: PAGE_BG }}>
      <header className="px-8 pb-4 pt-8">
        <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
          System Configuration
        </h1>
        <p className="mt-1 text-[0.8125rem] text-slate-500">
          Global admin controls for platform behavior and security.
        </p>
      </header>

      <div className="flex-1 px-8 pb-8">
        {error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-[0.8125rem] text-slate-500">Loading configuration…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {cards.map((card) => (
              <article
                key={card.id}
                className="rounded-xl border bg-white px-5 py-4"
                style={{ borderColor: BORDER }}
              >
                <h2 className="text-[0.8125rem] font-bold" style={{ color: NAVY }}>
                  {card.title}
                </h2>
                <ul className="mt-3 space-y-2">
                  {card.lines.map((line) => (
                    <li key={line} className="text-[0.8125rem] leading-relaxed text-slate-600">
                      {line}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}

        {!loading && cards.length === 0 && !error && (
          <p className="text-[0.8125rem] text-slate-500">No configuration data available.</p>
        )}
      </div>
    </div>
  );
}
