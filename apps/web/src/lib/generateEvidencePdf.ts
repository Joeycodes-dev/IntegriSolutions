import { jsPDF } from 'jspdf';
import type { TestRecord } from '../types';
import {
  buildTestEvidence,
  formatCourtReferenceId,
  formatDriverCategoryForReport,
  resolveEvidencePhotoUrls
} from './testEvidence';

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
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_W = CONTENT_W / 2 - 3;

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
  return y + 7;
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
  doc.text(lines, x, y + 4.5);
  return y + 4.5 + lines.length * 4.2;
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

async function renderEvidencePage(doc: jsPDF, test: TestRecord, pageIndex: number) {
  const evidence = buildTestEvidence(test);
  const refId = formatCourtReferenceId(test.id, test.createdAt);
  const resultLabel = test.result === 'fail' ? 'FAILED' : 'PASSED';
  const resultColor = test.result === 'fail' ? RED : GREEN;
  const photos = resolveEvidencePhotoUrls(evidence.photoUrls);

  let y = MARGIN + 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text('Reference ID', MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(refId, MARGIN, y);
  y += 9;
  drawHr(doc, y);
  y += 9;

  y = sectionTitle(doc, y, 'Driver Information');
  const leftX = MARGIN;
  const rightX = MARGIN + COL_W + 6;
  let yLeft = fieldBlock(doc, leftX, y, COL_W, 'Full Name', evidence.driverName);
  let yRight = fieldBlock(doc, rightX, y, COL_W, 'Driver ID', evidence.driverId);
  y = Math.max(yLeft, yRight) + 3;
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
  y = Math.max(yLeft, yRight) + 7;
  drawHr(doc, y);
  y += 9;

  y = sectionTitle(doc, y, 'Test Results');
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'Timestamp', evidence.timestamp);
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Roadblock', evidence.roadblock);
  y = Math.max(yLeft, yRight) + 3;
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'Result', resultLabel, { valueColor: resultColor });
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Reading', evidence.reading);
  y = Math.max(yLeft, yRight) + 3;
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'GPS', evidence.gps, { valueBold: false });
  y = yLeft + 7;
  drawHr(doc, y);
  y += 9;

  y = sectionTitle(doc, y, 'Officer Details');
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'Officer Name', evidence.officer);
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Service Number', evidence.serviceNumber);
  y = Math.max(yLeft, yRight) + 3;
  yLeft = fieldBlock(doc, leftX, y, COL_W, 'Rank', evidence.rank);
  yRight = fieldBlock(doc, rightX, y, COL_W, 'Station', evidence.station);
  y = Math.max(yLeft, yRight) + 7;
  drawHr(doc, y);
  y += 9;

  y = sectionTitle(doc, y, 'Officer Notes');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(routineNoteFor(test), MARGIN, y);
  y += 8;

  const noteLines = doc.splitTextToSize(evidence.officerNotes, CONTENT_W - 10);
  const boxH = Math.max(20, noteLines.length * 4.2 + 10);
  doc.setFillColor(...NOTE_BG);
  doc.setDrawColor(...LINE);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text(noteLines, MARGIN + 5, y + 7);
  y += boxH + 7;
  drawHr(doc, y);
  y += 9;

  y = sectionTitle(doc, y, 'Evidence');
  const imgW = (CONTENT_W - 4) / 2;
  const imgH = 44;
  const loaded = await Promise.all(photos.map((url) => loadImageDataUrl(url)));

  for (let i = 0; i < 2; i++) {
    const x = MARGIN + i * (imgW + 4);
    const img = loaded[i];
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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_LABEL);
  doc.text(
    `IntegriScan court-ready export · Page ${pageIndex + 1}`,
    PAGE_W / 2,
    287,
    { align: 'center' }
  );
}

export async function generateEvidencePdf(
  test: TestRecord,
  filename?: string
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await renderEvidencePage(doc, test, 0);
  const ref = formatCourtReferenceId(test.id, test.createdAt);
  doc.save(filename ?? `integriscan-${ref}.pdf`);
}

export async function generateWeeklyEvidencePdf(
  tests: TestRecord[],
  range?: { from: string; to: string }
): Promise<void> {
  if (tests.length === 0) {
    throw new Error('No records match the selected filters.');
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const sorted = [...tests].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) doc.addPage();
    await renderEvidencePage(doc, sorted[i], i);
  }

  const from = range?.from ?? 'report';
  const to = range?.to ?? 'export';
  doc.save(`integriscan-weekly-report-${from}-to-${to}.pdf`);
}
