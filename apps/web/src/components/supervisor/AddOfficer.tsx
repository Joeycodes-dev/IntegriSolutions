import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronDown, Copy } from 'lucide-react';
import { createFieldOfficer, getAccessToken } from '../../services/api';
import type { FieldOfficer } from '../../types';
import { serializeOfficerLocation } from '../../lib/officerLocation';
import { BORDER, NAVY, PAGE_BG, pageShell } from './supervisorStyles';

const RANKS = ['Constable', 'Sergeant', 'Warrant Officer', 'Captain'] as const;

const inputClassName =
  'h-[34px] w-full rounded-lg border bg-white px-3 text-[0.75rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/40 focus:ring-1 focus:ring-[#0D2137]/12';

const textareaClassName =
  'min-h-[72px] w-full resize-y rounded-lg border bg-white px-3 py-2 text-[0.75rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/40 focus:ring-1 focus:ring-[#0D2137]/12';

interface AddOfficerProps {
  onBack: () => void;
  onCreated: (officer: FieldOfficer) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[0.6875rem] font-semibold text-slate-700">{children}</span>;
}

export function AddOfficer({ onBack, onCreated }: AddOfficerProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [serviceNumber, setServiceNumber] = useState('');
  const [rank, setRank] = useState<string>(RANKS[0]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [createdOfficer, setCreatedOfficer] = useState<FieldOfficer | null>(null);
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyInviteLink = async () => {
    if (!createdOfficer?.inviteLink) return;
    try {
      await navigator.clipboard.writeText(createdOfficer.inviteLink);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email ||
      !serviceNumber.trim() ||
      !address.trim()
    ) {
      setError('Please complete all required fields.');
      return;
    }

    if (!getAccessToken()) {
      setError('Not signed in. Log in with your supervisor account to add officers.');
      return;
    }

    setIsLoading(true);
    try {
      const phoneDigits = phone.replace(/\D/g, '');
      const serviceDigits = serviceNumber.replace(/\D/g, '');
      const idNumber =
        phoneDigits.length >= 10
          ? phoneDigits.slice(-13)
          : serviceDigits.length >= 6
            ? serviceDigits.padStart(13, '0').slice(-13)
            : `${Date.now()}`.slice(-13);

      const created = await createFieldOfficer({
        email,
        name: firstName.trim(),
        surname: lastName.trim(),
        serviceNumber: serviceNumber.trim(),
        rank,
        station: serializeOfficerLocation({
          address: address.trim(),
          phone: phone.trim() || undefined
        }),
        phone: phone.trim(),
        idNumber
      });
      setCreatedOfficer(created);
      setCopyStatus(null);
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add officer');
    } finally {
      setIsLoading(false);
    }
  };

  if (createdOfficer) {
    return (
      <div className={`${pageShell} min-w-0`} style={{ backgroundColor: PAGE_BG }}>
        <div className="flex-1 px-5 py-5">
          <div
            className="mx-auto w-full max-w-[720px] rounded-xl border bg-white px-5 py-5 shadow-sm"
            style={{ borderColor: BORDER }}
          >
            <div className="mb-4 flex items-start gap-2.5">
              <button
                type="button"
                onClick={onBack}
                className="mt-0.5 shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Back to officers"
              >
                <ArrowLeft size={18} strokeWidth={2} />
              </button>
              <div>
                <h1 className="text-[0.9375rem] font-bold leading-tight" style={{ color: NAVY }}>
                  Officer Invite Ready
                </h1>
                <p className="mt-0.5 text-[0.75rem] leading-snug text-slate-500">
                  Share this link with {createdOfficer.firstName}. They will paste it in the mobile app to create their own login.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: BORDER }}>
              <FieldLabel>Invite Link</FieldLabel>
              <textarea
                readOnly
                value={createdOfficer.inviteLink ?? 'Invite link was not returned. Try creating the officer again.'}
                className="mt-1 min-h-[84px] w-full resize-none rounded-lg border bg-white px-3 py-2 font-mono text-[0.75rem] text-slate-700 outline-none"
                style={{ borderColor: BORDER }}
              />
              {createdOfficer.invitationExpiresAt ? (
                <p className="mt-1 text-[0.6875rem] text-slate-500">
                  Expires {new Date(createdOfficer.invitationExpiresAt).toLocaleDateString()}.
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyInviteLink}
                disabled={!createdOfficer.inviteLink}
                className="inline-flex h-[34px] items-center gap-2 rounded-lg px-4 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: NAVY }}
              >
                {copyStatus === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                {copyStatus === 'copied' ? 'Copied' : 'Copy invite link'}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="h-[34px] rounded-lg border bg-white px-4 text-[0.75rem] font-bold text-slate-700 transition hover:bg-slate-50"
                style={{ borderColor: BORDER }}
              >
                Done
              </button>
            </div>

            {copyStatus === 'failed' ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-800">
                Copy failed. Select the invite link text and copy it manually.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${pageShell} min-w-0`} style={{ backgroundColor: PAGE_BG }}>
      <div className="flex-1 px-5 py-5">
        <div
          className="mx-auto w-full max-w-[720px] rounded-xl border bg-white px-5 py-5 shadow-sm"
          style={{ borderColor: BORDER }}
        >
          <div className="mb-4 flex items-start gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Back to officers"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
            <div>
              <h1 className="text-[0.9375rem] font-bold leading-tight" style={{ color: NAVY }}>
                Add New Officer
              </h1>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-slate-500">
                Enter the officer details below to generate a mobile onboarding invite.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <label className="flex flex-col gap-1">
                <FieldLabel>First Name</FieldLabel>
                <input
                  className={inputClassName}
                  style={{ borderColor: BORDER }}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <FieldLabel>Last Name</FieldLabel>
                <input
                  className={inputClassName}
                  style={{ borderColor: BORDER }}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <label className="flex flex-col gap-1">
                <FieldLabel>Service number</FieldLabel>
                <input
                  className={inputClassName}
                  style={{ borderColor: BORDER }}
                  value={serviceNumber}
                  onChange={(e) => setServiceNumber(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <FieldLabel>Rank</FieldLabel>
                <div className="relative">
                  <select
                    className={`${inputClassName} appearance-none pr-8`}
                    style={{ borderColor: BORDER }}
                    value={rank}
                    onChange={(e) => setRank(e.target.value)}
                  >
                    {RANKS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <label className="flex flex-col gap-1">
                <FieldLabel>Email</FieldLabel>
                <input
                  type="email"
                  className={inputClassName}
                  style={{ borderColor: BORDER }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <FieldLabel>Phone Number</FieldLabel>
                <input
                  type="tel"
                  className={inputClassName}
                  style={{ borderColor: BORDER }}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <FieldLabel>Address</FieldLabel>
              <textarea
                className={textareaClassName}
                style={{ borderColor: BORDER }}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </label>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 w-full rounded-lg py-2.5 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: NAVY }}
            >
              {isLoading ? 'Generating invite…' : 'Generate Officer Invite'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
