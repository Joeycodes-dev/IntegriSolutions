import { useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, Copy, Mail } from 'lucide-react';
import { createFieldOfficer, getAccessToken } from '../../services/api';
import type { FieldOfficer } from '../../types';
import { SHIFT_SLOTS, type ShiftSlot } from '../../lib/officerDisplay';
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
  const [shift, setShift] = useState<ShiftSlot>(SHIFT_SLOTS[0]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [createdOfficer, setCreatedOfficer] = useState<FieldOfficer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
          phone: phone.trim() || undefined,
          shift
        }),
        phone: phone.trim(),
        idNumber
      });
      setCreatedOfficer(created);
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add officer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!createdOfficer?.inviteLink) return;
    try {
      await navigator.clipboard.writeText(createdOfficer.inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy invite link. Select and copy it manually.');
    }
  };

  if (createdOfficer) {
    const emailSent = createdOfficer.inviteEmailSent !== false && !createdOfficer.emailWarning;

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
                  {emailSent ? 'Officer Invite Sent' : 'Officer Created'}
                </h1>
                <p className="mt-0.5 text-[0.75rem] leading-snug text-slate-500">
                  {createdOfficer.firstName} can open the invite link in the mobile app and create a password.
                </p>
              </div>
            </div>

            <div
              className={`rounded-lg border p-4 ${emailSent ? 'bg-emerald-50' : 'bg-amber-50'}`}
              style={{ borderColor: emailSent ? '#bbf7d0' : '#fde68a' }}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 rounded-full p-2 ${
                    emailSent ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <p
                    className={`text-[0.8125rem] font-bold ${
                      emailSent ? 'text-emerald-900' : 'text-amber-900'
                    }`}
                  >
                    {emailSent
                      ? `Invite email sent to ${createdOfficer.email}`
                      : `Officer saved — share the invite link manually`}
                  </p>
                  <p
                    className={`mt-1 text-[0.75rem] leading-snug ${
                      emailSent ? 'text-emerald-800' : 'text-amber-800'
                    }`}
                  >
                    {emailSent
                      ? 'The invite link is single-use. The officer will sign in with this email after creating their password.'
                      : createdOfficer.emailWarning ||
                        'Email delivery is not configured. Copy the invite link below and send it to the officer.'}
                  </p>
                </div>
              </div>
              {createdOfficer.invitationExpiresAt ? (
                <p
                  className={`mt-3 text-[0.6875rem] ${
                    emailSent ? 'text-emerald-800' : 'text-amber-800'
                  }`}
                >
                  Expires {new Date(createdOfficer.invitationExpiresAt).toLocaleDateString()}.
                </p>
              ) : null}
            </div>

            {createdOfficer.inviteLink ? (
              <div className="mt-4 rounded-lg border bg-slate-50 px-3 py-3" style={{ borderColor: BORDER }}>
                <p className="text-[0.6875rem] font-semibold text-slate-600">Invite link</p>
                <p className="mt-1 break-all font-mono text-[0.6875rem] text-slate-700">
                  {createdOfficer.inviteLink}
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopyInvite()}
                  className="mt-2 inline-flex h-[30px] items-center gap-1.5 rounded-md border bg-white px-2.5 text-[0.6875rem] font-semibold text-slate-700 transition hover:bg-slate-100"
                  style={{ borderColor: BORDER }}
                >
                  <Copy size={12} />
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            ) : null}

            {error && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">{error}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-[34px] items-center gap-2 rounded-lg px-4 text-[0.75rem] font-bold text-white transition hover:brightness-110"
                style={{ backgroundColor: NAVY }}
              >
                <Mail size={14} />
                Done
              </button>
            </div>
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
              <FieldLabel>Shift</FieldLabel>
              <div className="relative">
                <select
                  className={`${inputClassName} appearance-none pr-8`}
                  style={{ borderColor: BORDER }}
                  value={shift}
                  onChange={(e) => setShift(e.target.value as ShiftSlot)}
                >
                  {SHIFT_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>
            </label>

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
