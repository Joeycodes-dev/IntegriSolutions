import { useEffect, useMemo, useRef, useState } from 'react';
import { generateEvidencePdf } from '../../lib/generateEvidencePdf';
import {
  ArrowLeft,
  CheckCircle2,
  FileDown,
  ImagePlus,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  ShieldX
} from 'lucide-react';
import type { TestRecord } from '../../types';
import { buildTestEvidence, resolveEvidencePhotoUrls } from '../../lib/testEvidence';
import { annotateTest, getAnnotations, getEvidence, uploadEvidence, type Annotation, type EvidencePhoto } from '../../services/api';
import { BORDER, NAVY, PAGE_BG, pageShell } from './supervisorStyles';

interface EvidenceReviewProps {
  test: TestRecord;
  onBack: () => void;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: BORDER }}>
      <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[0.8125rem] font-semibold leading-snug" style={{ color: NAVY }}>
        {value}
      </p>
    </div>
  );
}

function formatAnnotationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusColor(status: string): { bg: string; border: string; text: string } {
  if (status === 'approved') return { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' };
  if (status === 'referred') return { bg: '#fffbeb', border: '#fde68a', text: '#92400e' };
  return { bg: '#f8fafc', border: '#e2e8f0', text: '#475569' };
}

export function EvidenceReview({ test, onBack }: EvidenceReviewProps) {
  const evidence = useMemo(() => buildTestEvidence(test), [test]);
  const photos = useMemo(() => resolveEvidencePhotoUrls(evidence.photoUrls), [evidence.photoUrls]);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState<'approved' | 'referred' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setAnnotationsLoading(true);
    getAnnotations(test.id)
      .then((data) => { if (!cancelled) setAnnotations(data); })
      .catch(() => { if (!cancelled) setAnnotations([]); })
      .finally(() => { if (!cancelled) setAnnotationsLoading(false); });
    return () => { cancelled = true; };
  }, [test.id]);

  useEffect(() => {
    let cancelled = false;
    getEvidence(test.id)
      .then((data) => { if (!cancelled) setEvidencePhotos(data); })
      .catch(() => { if (!cancelled) setEvidencePhotos([]); });
    return () => { cancelled = true; };
  }, [test.id]);

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadEvidence(test.id, file);
      setEvidencePhotos((prev) => [uploaded, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      await generateEvidencePdf(test);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleAnnotate = async (status: 'approved' | 'referred') => {
    setSubmitting(status);
    setSubmitError(null);
    try {
      const created = await annotateTest(test.id, {
        comment: comment.trim() || undefined,
        status
      });
      setAnnotations((prev) => [created, ...prev]);
      setComment('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Annotation failed');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4" style={{ borderColor: BORDER }}>
        <div className="flex min-w-0 items-start gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Back to logs"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
              Evidence Review
            </h1>
            <p className="mt-0.5 text-[0.75rem] text-slate-500">
              Reference ID:{' '}
              <span className="font-mono font-medium text-slate-600">{evidence.referenceId}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleGeneratePdf()}
          disabled={generatingPdf}
          className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-lg px-3.5 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: NAVY }}
        >
          <FileDown size={15} strokeWidth={2} />
          {generatingPdf ? 'Generating…' : 'Generate Court PDF'}
        </button>
      </header>

      {test.hashValid === false && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-6 py-2.5">
          <ShieldX size={16} className="shrink-0 text-rose-600" strokeWidth={2} />
          <p className="text-[0.75rem] font-semibold text-rose-800">
            Tampering detected — SHA-256 hash does not match the original record. This evidence may not be admissible in court.
          </p>
        </div>
      )}
      {test.hashValid === true && (
        <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-6 py-2.5">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" strokeWidth={2} />
          <p className="text-[0.75rem] font-semibold text-emerald-800">
            Record integrity verified — SHA-256 hash matches the original capture.
          </p>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3 p-4 lg:grid-cols-2 lg:p-5">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Driver &amp; Incident Details
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <DetailField label="DRIVER NAME" value={evidence.driverName} />
              <DetailField label="DRIVER ID" value={evidence.driverId} />
              <DetailField label="CATEGORY" value={evidence.driverCategory} />
              <DetailField label="READING" value={evidence.reading} />
              <DetailField label="OFFICER" value={evidence.officer} />
              <DetailField label="SERVICE NO" value={evidence.serviceNumber} />
              <DetailField label="RANK" value={evidence.rank} />
              <DetailField label="STATION" value={evidence.station} />
            </div>
          </section>

          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[0.8125rem] font-bold" style={{ color: NAVY }}>
                Photo Gallery
              </h2>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUploadPhoto(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  style={{ borderColor: BORDER }}
                >
                  {uploading ? (
                    <Loader2 size={12} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <ImagePlus size={12} strokeWidth={2} />
                  )}
                  {uploading ? 'Uploading...' : 'Add Photo'}
                </button>
              </div>
            </div>
            {uploadError && (
              <p className="mb-2 text-[0.6875rem] font-medium text-rose-600">{uploadError}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {evidencePhotos.slice(0, 4).map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-[4/3] overflow-hidden rounded-lg border bg-slate-100"
                  style={{ borderColor: BORDER }}
                >
                  <img
                    src={photo.photo_url}
                    alt={`Evidence ${photo.id}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
              {evidencePhotos.length === 0 && photos.slice(0, 2).map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="aspect-[4/3] overflow-hidden rounded-lg border bg-slate-100"
                  style={{ borderColor: BORDER }}
                >
                  <img
                    src={url}
                    alt={`Evidence ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
            {evidencePhotos.length === 0 && photos.length === 0 && (
              <p className="mt-2 text-[0.6875rem] text-slate-400">
                No evidence photos uploaded yet.
              </p>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3">
          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Location &amp; Timing
            </h2>
            <div className="space-y-2 text-[0.8125rem]">
              <div>
                <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">TIMESTAMP</p>
                <p className="mt-0.5 font-semibold text-slate-800">{evidence.timestamp}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">ROADBLOCK</p>
                <p className="mt-0.5 font-semibold text-slate-800">{evidence.roadblock}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">LOCATION</p>
                <p className="mt-0.5 flex items-start gap-1 font-semibold text-slate-800">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-blue-600" strokeWidth={2} />
                  {evidence.locationLabel}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.1em] text-slate-500">GPS</p>
                <p className="mt-0.5 font-mono text-[0.75rem] font-semibold text-slate-700">
                  {evidence.gps}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Officer Notes
            </h2>
            <div
              className="min-h-[88px] rounded-lg border px-3 py-2.5 text-[0.8125rem] leading-relaxed text-slate-700"
              style={{ borderColor: BORDER }}
            >
              {evidence.officerNotes}
            </div>
          </section>

          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Supervisor Action
            </h2>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment or reason (optional)..."
              rows={3}
              className="mb-2.5 w-full resize-none rounded-lg border px-3 py-2 text-[0.8125rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
              style={{ borderColor: BORDER }}
            />

            {submitError && (
              <p className="mb-2 text-[0.6875rem] font-medium text-rose-600">{submitError}</p>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleAnnotate('approved')}
                disabled={submitting !== null}
                className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg px-3 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: NAVY }}
              >
                {submitting === 'approved' ? (
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                ) : (
                  <ShieldCheck size={15} strokeWidth={2} />
                )}
                Verify and Archive
              </button>
              <button
                type="button"
                onClick={() => void handleAnnotate('referred')}
                disabled={submitting !== null}
                className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[0.75rem] font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting === 'referred' ? (
                  <Loader2 size={15} strokeWidth={2} className="animate-spin text-amber-700" />
                ) : (
                  <ShieldAlert size={15} strokeWidth={2} className="text-amber-700" />
                )}
                Flag for Investigation
              </button>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
            <h2 className="mb-2.5 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Annotation History
            </h2>
            {annotationsLoading ? (
              <p className="py-4 text-center text-[0.6875rem] text-slate-400">Loading annotations...</p>
            ) : annotations.length === 0 ? (
              <p className="py-4 text-center text-[0.6875rem] text-slate-400">No annotations yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {annotations.map((ann) => {
                  const colors = statusColor(ann.status);
                  return (
                    <div
                      key={ann.id}
                      className="rounded-lg border px-3 py-2"
                      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{ color: colors.text, backgroundColor: `${colors.border}40` }}
                        >
                          {ann.status === 'approved' && <CheckCircle2 size={10} />}
                          {ann.status}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatAnnotationTime(ann.created_at)}
                        </span>
                      </div>
                      {ann.comment && (
                        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-slate-700">
                          {ann.comment}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-500">
                        by {ann.supervisor_email}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
