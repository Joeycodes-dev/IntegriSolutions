import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import type { RuntimeConfig, TestRecord, VerificationTokenRecord } from '../types';
import { buildTestEvidence, formatDriverCategoryForReport, resolveEvidencePhotoUrls } from './testEvidence';
import { buildVerificationUrl } from './verificationRoute';
import { DEFAULT_RUNTIME_CONFIG } from './runtimeConfig';
import { getAnnotations, getEvidence, getRuntimeConfig, getVerificationTokens, type Annotation, type EvidencePhoto } from '../services/api';

type RGB = [number, number, number];

const BLUE: RGB = [37, 99, 235];
const NAVY: RGB = [15, 23, 42];
const GRAY_LABEL: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const RED: RGB = [220, 38, 38];
const GREEN: RGB = [22, 163, 74];
const NOTE_BG: RGB = [241, 245, 249];

const MARGIN = 18;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_W = CONTENT_W / 2 - 3;
const FOOTER_Y = 287;
const BOTTOM_LIMIT = 272;

const QR_SIZE = 20;
const QR_X = PAGE_W - MARGIN - QR_SIZE;
const QR_Y = 19;

/** Tracks the true global page number so footers stay correct across overflow pages. */
interface PageContext {
  currentPage: number;
}

function drawHr(doc: jsPDF, y: number) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
}

function sectionTitle(doc: jsPDF, y: number, title: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLUE);
  doc.text(title, MARGIN, y);
  return y + 5;
}

function fieldBlock(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  opts?: { valueBold?: boolean; valueColor?: RGB }
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_LABEL);
  doc.text(label, x, y);

  doc.setFont('helvetica', opts?.valueBold === false ? 'normal' : 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...(opts?.valueColor ?? NAVY));

  const lines = doc.splitTextToSize(value, w);
  doc.text(lines, x, y + 4);
  return y + 4 + lines.length * 4.2;
}

function drawPlaceholderImage(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...LINE);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_LABEL);
  doc.text('Evidence photo pending', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' });
}

async function loadImageDataUrl(
  url: string
): Promise<{ data: string; format: 'JPEG' | 'PNG' } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG';
    return { data, format };
  } catch {
    return null;
  }
}

function routineNoteFor(test: TestRecord): string {
  return test.result === 'pass'
    ? 'Routine stop. No visible impairment.'
    : 'Routine stop. Suspected impairment recorded.';
}

function formatUtcDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

async function drawVerificationQr(doc: jsPDF, verification: VerificationTokenRecord) {
  const qrUrl = buildVerificationUrl(verification.token);
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'H', margin: 1, width: 280 });
  } catch {
    qrDataUrl = null;
  }
  if (!qrDataUrl) {
    throw new Error('Failed to generate the court verification QR code.');
  }

  doc.addImage(qrDataUrl, 'PNG', QR_X, QR_Y, QR_SIZE, QR_SIZE, undefined, 'FAST');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY_LABEL);
  doc.text('Scan to verify', QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + 3.5, { align: 'center' });
  doc.text(`Issued ${formatUtcDate(verification.issuedAt)}`, QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + 7, { align: 'center' });
}

function drawWatermark(doc: jsPDF, text: string | null) {
  if (!text) return;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(200, 206, 214);
  doc.text(text, PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: 45 });
}

/** Header band with reference ID and QR; returns the y position after the divider. */
async function drawPageHeader(
  doc: jsPDF,
  refId: string,
  verification: VerificationTokenRecord,
  watermarkText: string | null
): Promise<number> {
  let y = MARGIN + 2;

  drawWatermark(doc, watermarkText);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text('Reference ID', MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(refId, MARGIN, y);
  y += 9;

  await drawVerificationQr(doc, verification);

  drawHr(doc, y + 19);
  return y + 19 + 8;
}

function drawFooter(doc: jsPDF, pageNumber: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_LABEL);
  doc.text(
    `IntegriScan court-ready export · Page ${pageNumber} · Generated ${new Date().toISOString()}`,
    PAGE_W / 2,
    FOOTER_Y,
    { align: 'center' }
  );
}

async function renderEvidencePage(
  doc: jsPDF,
  test: TestRecord,
  ctx: PageContext,
  verification: VerificationTokenRecord,
  runtime: RuntimeConfig
): Promise<void> {
  const evidence = buildTestEvidence(test);
  const refId = verification.referenceId;
  const watermarkText = runtime.export.pdfWatermarkEnabled ? runtime.export.pdfWatermarkText : null;
  const resultLabel = test.result === 'fail' ? 'FAILED' : 'PASSED';
  const resultColor = test.result === 'fail' ? RED : GREEN;

  let annotations: Annotation[] = [];
  let evidencePhotos: EvidencePhoto[] = [];
  try {
    [annotations, evidencePhotos] = await Promise.all([
      getAnnotations(test.id),
      getEvidence(test.id)
    ]);
  } catch {
    // Non-blocking: continue without annotations/evidence photos
  }

  /** Adds a page (with a fresh header + QR) when the next block would exceed the bottom limit. */
  const ensureSpace = async (y: number, needed: number): Promise<number> => {
    if (y + needed <= BOTTOM_LIMIT) return y;
    drawFooter(doc, ctx.currentPage);
    doc.addPage();
    ctx.currentPage += 1;
    return drawPageHeader(doc, refId, verification, watermarkText);
  };

  let y = await drawPageHeader(doc, refId, verification, watermarkText);

  y = await ensureSpace(y, 40);
  y = sectionTitle(doc, y, 'Driver Information');
  const leftX = MARGIN;
  const rightX = MARGIN + COL_W + 6;
  let yLeft = fieldBlock(doc, leftX, y, COL_W, 'Full Name', evidence.driverName);
  let yRight = fieldBlock(doc, rightX, y, COL_W, 'Driver ID', evidence.driverId);
  y = Math.max(yLeft, yRight) + 2;
  yLeft = fieldBlock(
    doc,
    leftX,
    y,
    COL_W,
    'Category',
    formatDriverCategoryForReport(evidence.driverCategory)
  );
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Location', evidence.locationLabel, {
    valueColor: BLUE
  });
  y = Math.max(yLeft, yRight) + 6;
  drawHr(doc, y);
  y += 6;

  y = await ensureSpace(y, 42);
  y = sectionTitle(doc, y, 'Test Results');
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'Timestamp', evidence.timestamp);
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Roadblock', evidence.roadblock);
  y = Math.max(yLeft, yRight) + 2;
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'Result', resultLabel, { valueColor: resultColor });
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Reading', evidence.reading);
  y = Math.max(yLeft, yRight) + 2;
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'GPS', evidence.gps, { valueBold: false });
  y = yLeft + 6;
  drawHr(doc, y);
  y += 6;

  y = await ensureSpace(y, 34);
  y = sectionTitle(doc, y, 'Officer Details');
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'Officer Name', evidence.officer);
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Service Number', evidence.serviceNumber);
  y = Math.max(yLeft, yRight) + 2;
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'Rank', evidence.rank);
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Station', evidence.station);
  y = Math.max(yLeft, yRight) + 6;
  drawHr(doc, y);
  y += 6;

  y = await ensureSpace(y, 30);
  y = sectionTitle(doc, y, 'Officer Notes');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(routineNoteFor(test), MARGIN, y);
  y += 6;

  const noteLines = doc.splitTextToSize(evidence.officerNotes, CONTENT_W - 10);
  const noteBoxH = Math.max(16, noteLines.length * 4.2 + 8);
  y = await ensureSpace(y, noteBoxH + 14);
  doc.setFillColor(...NOTE_BG);
  doc.setDrawColor(...LINE);
  doc.roundedRect(MARGIN, y, CONTENT_W, noteBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text(noteLines, MARGIN + 5, y + 6);
  y += noteBoxH + 6;
  drawHr(doc, y);
  y += 6;

  const uploadedPhotoUrls = evidencePhotos.map((p) => p.photo_url);
  const embeddedPhotoUrls = resolveEvidencePhotoUrls(evidence.photoUrls);
  const allPhotos = uploadedPhotoUrls.length > 0 ? uploadedPhotoUrls : embeddedPhotoUrls;
  const imgW = (CONTENT_W - 3) / 2;
  const imgH = 38;

  if (allPhotos.length > 0) {
    y = await ensureSpace(y, 44);
    y = sectionTitle(doc, y, 'Evidence');

    const loaded = await Promise.all(allPhotos.slice(0, 4).map((url) => loadImageDataUrl(url)));
    const visible = Math.min(loaded.length, 4);

    for (let row = 0; row < Math.ceil(visible / 2); row++) {
      y = await ensureSpace(y, imgH + 8);
      for (let col = 0; col < 2; col++) {
        const index = row * 2 + col;
        if (index >= visible) break;
        const x = MARGIN + col * (imgW + 3);
        const img = loaded[index];
        if (img) {
          try {
            doc.addImage(img.data, img.format, x, y, imgW, imgH, undefined, 'FAST');
          } catch {
            drawPlaceholderImage(doc, x, y, imgW, imgH);
          }
        } else {
          drawPlaceholderImage(doc, x, y, imgW, imgH);
        }
      }
      y += imgH + 3;
    }
    y += 6;
    drawHr(doc, y);
    y += 6;
  }

  y = await ensureSpace(y, 48);
  y = sectionTitle(doc, y, 'Integrity Verification');
  const hashStatus = verification.hashStatus === 'verified'
    ? 'VERIFIED'
    : verification.hashStatus === 'tampered'
    ? 'TAMPERED'
    : 'UNAVAILABLE';
  const hashColor = verification.hashStatus === 'verified'
    ? GREEN
    : verification.hashStatus === 'tampered'
    ? RED
    : GRAY_LABEL;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...hashColor);
  doc.text(`Status: ${hashStatus}`, MARGIN, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_LABEL);
  doc.text('SHA-256 Hash:', MARGIN, y);
  y += 3.5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...NAVY);
  const hashLines = doc.splitTextToSize(verification.hash || 'N/A', CONTENT_W);
  doc.text(hashLines, MARGIN, y);
  y += hashLines.length * 3.5 + 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRAY_LABEL);
  doc.text(`Verification link issued: ${verification.issuedAt}`, MARGIN, y);
  y += 4;

  if (verification.hashStatus === 'tampered') {
    y = await ensureSpace(y, 16);
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(...RED);
    doc.roundedRect(MARGIN, y, CONTENT_W, 12, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...RED);
    doc.text('WARNING: Record integrity compromised', MARGIN + 5, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Hash does not match original capture. May not be admissible.', MARGIN + 5, y + 9);
    y += 14;
  }

  y += 2;
  drawHr(doc, y);
  y += 6;

  if (annotations.length > 0) {
    y = await ensureSpace(y, 30);
    y = sectionTitle(doc, y, 'Supervisor Annotations');
    for (const ann of annotations.slice(0, 3)) {
      const statusLabel = ann.status.toUpperCase();
      const statusColor = ann.status === 'approved' ? GREEN : ann.status === 'referred' ? [245, 158, 11] as RGB : GRAY_LABEL;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...statusColor);
      doc.text(`[${statusLabel}]`, MARGIN, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_LABEL);
      const timeStr = new Date(ann.created_at).toLocaleString();
      doc.text(`by ${ann.supervisor_email} · ${timeStr}`, MARGIN + 25, y);
      y += 4;

      if (ann.comment) {
        y = await ensureSpace(y, 22);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...NAVY);
        const commentLines = doc.splitTextToSize(ann.comment, CONTENT_W - 10);
        doc.text(commentLines, MARGIN + 5, y);
        y += commentLines.length * 3.8 + 2;
      }
      y += 2;
    }
    drawHr(doc, y);
    y += 6;
  }

  drawFooter(doc, ctx.currentPage);
}

export async function generateEvidencePdf(
  test: TestRecord,
  filename?: string
): Promise<void> {
  const [records, runtime] = await Promise.all([
    getVerificationTokens([test.id]),
    getRuntimeConfig().catch(() => DEFAULT_RUNTIME_CONFIG)
  ]);
  const verification = records.find((record) => record.testId === test.id) ?? records[0];
  if (!verification) {
    throw new Error('Failed to prepare the court verification link for this record.');
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ctx: PageContext = { currentPage: 1 };
  await renderEvidencePage(doc, test, ctx, verification, runtime);
  doc.save(filename ?? `integriscan-${verification.referenceId}.pdf`);
}

export async function generateWeeklyEvidencePdf(
  tests: TestRecord[],
  range?: { from: string; to: string }
): Promise<void> {
  if (tests.length === 0) {
    throw new Error('No records match the selected filters.');
  }

  const sorted = [...tests].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const [records, runtime] = await Promise.all([
    getVerificationTokens(sorted.map((test) => test.id)),
    getRuntimeConfig().catch(() => DEFAULT_RUNTIME_CONFIG)
  ]);
  const byTestId = new Map(records.map((record) => [record.testId, record]));
  for (const test of sorted) {
    if (!byTestId.has(test.id)) {
      throw new Error(`Failed to prepare a court verification link for record ${test.id}.`);
    }
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ctx: PageContext = { currentPage: 1 };

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      doc.addPage();
      ctx.currentPage += 1;
    }
    await renderEvidencePage(doc, sorted[i], ctx, byTestId.get(sorted[i].id)!, runtime);
  }

  const from = range?.from ?? 'report';
  const to = range?.to ?? 'export';
  doc.save(`integriscan-weekly-report-${from}-to-${to}.pdf`);
}
