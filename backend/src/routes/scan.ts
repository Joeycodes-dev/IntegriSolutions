import { Router } from 'express';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { asyncHandler } from '../asyncHandler';

const router = Router();
let workerPromise: ReturnType<typeof createWorker> | null = null;

interface DriverLicenseData {
  name: string;
  surname: string;
  initials: string;
  idNumber: string;
  licenseNumber: string;
  dob: string;
  expiryDate: string;
  licenseCodes: string;
}

interface FieldCandidate {
  value: string;
  score: number;
  source: string;
}

interface OcrPassResult {
  name: string;
  text: string;
  confidence: number;
}

interface OcrDebug {
  overallConfidence: number;
  fieldConfidence: Record<string, number>;
  passes: Array<{ name: string; confidence: number; preview: string }>;
  usedPaidFallback: boolean;
  fallbackReason: string | null;
}

type ScanResponse = DriverLicenseData & { _ocr: OcrDebug };

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng');
  }
  return workerPromise;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toDigits(value: string): string {
  return value
    .toUpperCase()
    .replace(/[OQ]/g, '0')
    .replace(/I/g, '1')
    .replace(/[^0-9]/g, '');
}

function toAlphaNum(value: string): string {
  return value
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function toAlphaName(value: string): string {
  return value
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B')
    .replace(/[^A-Z'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toAlphaNumLicense(value: string): string {
  return toAlphaNum(value)
    .replace(/O/g, '0')
    .replace(/S/g, '5')
    .replace(/B/g, '8');
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b|\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (!match) return '';

  if (match[1]) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  const yearRaw = match[6].padStart(4, '0');
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return `${year}-${match[5].padStart(2, '0')}-${match[4].padStart(2, '0')}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`OCR timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function extractDateCandidates(text: string): string[] {
  const matches = text.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b/g) ?? [];
  return matches
    .map((value) => normalizeDate(value))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function pickBest(current: FieldCandidate, candidate: FieldCandidate): FieldCandidate {
  if (!candidate.value) return current;
  if (!current.value || candidate.score > current.score) return candidate;
  return current;
}

function emptyCandidate(source: string): FieldCandidate {
  return { value: '', score: 0, source };
}

function extractInitialsSurname(text: string, passConfidence: number, source: string): { initials: FieldCandidate; surname: FieldCandidate } {
  const lines = text
    .split(/\n+/)
    .map((line) => normalizeSpaces(line).toUpperCase())
    .filter(Boolean);

  const skip = /DRIVING|LICEN|SOUTH|AFRICA|IDENTITY|VALID|REPUBLIC|DATE|BIRTH|EXPIRY|RSA|SADC|CONDUCAO/;
  for (const line of lines) {
    if (skip.test(line)) continue;
    const match = line.match(/^([A-Z]{1,3})\s+([A-Z][A-Z'\-]{2,})$/);
    if (!match) continue;
    return {
      initials: { value: match[1], score: Math.min(0.95, 0.5 + passConfidence * 0.45), source },
      surname: { value: match[2], score: Math.min(0.95, 0.52 + passConfidence * 0.43), source }
    };
  }

  return { initials: emptyCandidate(source), surname: emptyCandidate(source) };
}

function parseRequiredFields(text: string, passConfidenceRaw: number, source: string): {
  initials: FieldCandidate;
  surname: FieldCandidate;
  idNumber: FieldCandidate;
  licenseNumber: FieldCandidate;
  expiryDate: FieldCandidate;
  dob: FieldCandidate;
} {
  const passConfidence = Math.max(0, Math.min(1, passConfidenceRaw / 100));
  const normalized = text.replace(/\r/g, '').replace(/[|;]/g, '\n');
  const joined = normalized.toUpperCase();
  const lines = normalized
    .split(/\n+/)
    .map((line) => normalizeSpaces(line.toUpperCase()))
    .filter(Boolean);

  let initials = emptyCandidate(source);
  let surname = emptyCandidate(source);
  let idNumber = emptyCandidate(source);
  let licenseNumber = emptyCandidate(source);
  let expiryDate = emptyCandidate(source);
  let dob = emptyCandidate(source);

  const fromName = extractInitialsSurname(normalized, passConfidence, `${source}:name`);
  initials = pickBest(initials, fromName.initials);
  surname = pickBest(surname, fromName.surname);

  // SA licence often presents initials and surname on a single line like: BP MALUNGA
  for (const line of lines) {
    if (/DRIVING|LICEN|SOUTH|AFRICA|ID\s*NO|BIRTH|VALID|ISSUED|CODE|RESTRICTION|ZA|SADC|CONDUCAO/.test(line)) {
      continue;
    }

    const cleaned = toAlphaName(line);
    const tokens = cleaned.split(' ').filter(Boolean);
    if (tokens.length < 2) continue;

    const maybeInitials = tokens[0];
    const maybeSurname = tokens[1];
    if (/^[A-Z]{1,3}$/.test(maybeInitials) && /^[A-Z][A-Z'\-]{2,}$/.test(maybeSurname)) {
      initials = pickBest(initials, {
        value: maybeInitials,
        score: Math.min(0.97, 0.68 + passConfidence * 0.25),
        source: `${source}:sa-name-line`
      });
      surname = pickBest(surname, {
        value: maybeSurname,
        score: Math.min(0.97, 0.7 + passConfidence * 0.24),
        source: `${source}:sa-name-line`
      });
      break;
    }
  }

  const labelInitials = joined.match(/INITIALS?\s*[:#-]?\s*([A-Z]{1,3})/);
  if (labelInitials?.[1]) {
    initials = pickBest(initials, {
      value: labelInitials[1],
      score: Math.min(0.97, 0.62 + passConfidence * 0.35),
      source: `${source}:label-initials`
    });
  }

  const labelSurname = joined.match(/(?:SURNAME|LAST\s*NAME|FAMILY\s*NAME)\s*[:#-]?\s*([A-Z][A-Z'\-]{2,})/);
  if (labelSurname?.[1]) {
    surname = pickBest(surname, {
      value: labelSurname[1],
      score: Math.min(0.97, 0.64 + passConfidence * 0.33),
      source: `${source}:label-surname`
    });
  }

  const idFromLabel = toDigits(
    joined.match(/(?:ID\s*NO\.?|ID\s*NUMBER|IDENTITY\s*NUMBER)\s*[:#-]?\s*([0-9OQI\s\/-]{10,24})/)?.[1] ?? ''
  );

  const idFromLine = lines
    .filter((line) => /ID\s*NO|ID\s*NUMBER|IDENTITY\s*NUMBER/.test(line))
    .map((line) => toDigits(line))
    .find((v) => v.length >= 10) ?? '';

  const idMatches = Array.from(joined.matchAll(/\b[0-9OQI\s\/-]{13,22}\b/g))
    .map((m) => toDigits(m[0]))
    .filter((v) => v.length >= 10);

  const idBest = idFromLabel || idFromLine || idMatches.find((v) => v.length === 13) || idMatches[0] || '';
  if (idBest) {
    const value = idBest.length >= 13 ? idBest.slice(0, 13) : idBest;
    idNumber = pickBest(idNumber, {
      value,
      score: value.length === 13
        ? Math.min(0.98, (idFromLabel || idFromLine ? 0.74 : 0.66) + passConfidence * 0.24)
        : 0.45,
      source: idFromLabel || idFromLine ? `${source}:id-label` : `${source}:id-pattern`
    });
  }

  const licenseFromLine = lines
    .filter((line) => /LICEN[CS]E\s*NUMBER|LICEN[CS]E\s*NO\.?|DL\s*NO/.test(line))
    .map((line) => toAlphaNumLicense(line.replace(/.*(?:LICEN[CS]E\s*NUMBER|LICEN[CS]E\s*NO\.?|DL\s*NO)\s*[:#-]?/, '')))
    .find((v) => /^[A-Z0-9]{6,16}$/.test(v)) ?? '';

  const licenseLabeled = toAlphaNumLicense((joined.match(/(?:LICEN[CS]E\s*NUMBER|LICEN[CS]E\s*NO\.?|DL\s*NO)\s*[:#-]?\s*([A-Z0-9\/\s-]{6,24})/)?.[1] ?? ''));
  const licenseFallback = toAlphaNum((joined.match(/\b[A-Z0-9]{6,16}\b/g)?.find((v) => /[A-Z]/.test(v) && /\d/.test(v)) ?? ''));
  const license = licenseFromLine || licenseLabeled || licenseFallback;
  if (license) {
    licenseNumber = pickBest(licenseNumber, {
      value: license,
      score: licenseFromLine
        ? Math.min(0.95, 0.68 + passConfidence * 0.26)
        : (licenseLabeled ? Math.min(0.94, 0.62 + passConfidence * 0.3) : Math.min(0.82, 0.48 + passConfidence * 0.25)),
      source: licenseFromLine ? `${source}:line-license` : (licenseLabeled ? `${source}:label-license` : `${source}:pattern-license`)
    });
  }

  const validRangeMatch = joined.match(/VALID[^\n]{0,40}(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s*[-–]\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
  const validRangeExpiry = normalizeDate(validRangeMatch?.[2] ?? '');
  const validRangeDob = normalizeDate(validRangeMatch?.[1] ?? '');

  const validFromLine = lines
    .filter((line) => /^VALID\b/.test(line))
    .map((line) => {
      const m = line.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}).*?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
      return normalizeDate(m?.[2] ?? '');
    })
    .find(Boolean) ?? '';

  if (validRangeDob) {
    dob = pickBest(dob, {
      value: validRangeDob,
      score: Math.min(0.9, 0.62 + passConfidence * 0.2),
      source: `${source}:valid-range-start`
    });
  }

  if (validFromLine || validRangeExpiry) {
    expiryDate = pickBest(expiryDate, {
      value: validFromLine || validRangeExpiry,
      score: Math.min(0.99, 0.78 + passConfidence * 0.18),
      source: validFromLine ? `${source}:valid-line-end` : `${source}:valid-range-end`
    });
  }

  const dates = extractDateCandidates(joined);
  if (dates.length > 0) {
    const sorted = [...dates].sort();
    const likelyDob = sorted[0];
    const likelyExpiry = sorted[sorted.length - 1];

    if (likelyDob) {
      dob = pickBest(dob, {
        value: likelyDob,
        score: Math.min(0.8, 0.44 + passConfidence * 0.3),
        source: `${source}:date-dob`
      });
    }

    if (likelyExpiry) {
      expiryDate = pickBest(expiryDate, {
        value: likelyExpiry,
        score: Math.min(0.9, 0.56 + passConfidence * 0.3),
        source: `${source}:date-expiry`
      });
    }
  }

  const explicitExpiry = normalizeDate(joined.match(/(?:EXPIRY|VALID\s*UNTIL|EXPIRES|VALID\s*TO)\s*[:#-]?\s*([^\n]+)/)?.[1] ?? '');
  if (explicitExpiry) {
    expiryDate = pickBest(expiryDate, {
      value: explicitExpiry,
      score: Math.min(0.97, 0.68 + passConfidence * 0.28),
      source: `${source}:label-expiry`
    });
  }

  return { initials, surname, idNumber, licenseNumber, expiryDate, dob };
}

function findInitialsAndSurname(lines: string[], source: string): { initials: FieldCandidate; surname: FieldCandidate; name: FieldCandidate } {
  const skip = /DRIVING|LICEN|SOUTH|AFRICA|RESTRICT|ISSUED|VALID|CODE|BIRTH|NUMBER|ID\s*NO|RSA|ZA/i;

  for (const raw of lines) {
    const line = normalizeSpaces(raw.replace(/[^A-Za-z\s.'-]/g, ' '));
    if (!line || skip.test(line)) continue;

    const upperLine = line.toUpperCase();
    const tokens = upperLine.split(' ').filter(Boolean);
    if (tokens.length < 2) continue;

    const initials = tokens[0].replace(/[^A-Z]/g, '');
    const surname = tokens[1].replace(/[^A-Z'-]/g, '');
    if (initials.length >= 1 && initials.length <= 3 && surname.length >= 3) {
      return {
        initials: { value: initials, score: 0.86, source },
        surname: { value: surname, score: 0.84, source },
        name: { value: initials, score: 0.65, source }
      };
    }
  }

  return {
    initials: emptyCandidate(source),
    surname: emptyCandidate(source),
    name: emptyCandidate(source)
  };
}

function parseFromText(text: string, source: string): {
  initials: FieldCandidate;
  surname: FieldCandidate;
  name: FieldCandidate;
  idNumber: FieldCandidate;
  licenseNumber: FieldCandidate;
  dob: FieldCandidate;
  expiryDate: FieldCandidate;
  licenseCodes: FieldCandidate;
} {
  const normalized = text.replace(/\r/g, '').replace(/[|;]/g, '\n');
  const lines = normalized
    .split(/\n+/)
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);
  const joined = lines.join('\n');

  let initials = emptyCandidate(source);
  let surname = emptyCandidate(source);
  let name = emptyCandidate(source);
  let idNumber = emptyCandidate(source);
  let licenseNumber = emptyCandidate(source);
  let dob = emptyCandidate(source);
  let expiryDate = emptyCandidate(source);
  let licenseCodes = emptyCandidate(source);

  const nameBlock = findInitialsAndSurname(lines, `${source}:name-block`);
  initials = pickBest(initials, nameBlock.initials);
  surname = pickBest(surname, nameBlock.surname);
  name = pickBest(name, nameBlock.name);

  const labeledInitials = normalizeSpaces((joined.match(/initials?\s*[:#-]?\s*([^\n]+)/i)?.[1] ?? '').toUpperCase());
  if (labeledInitials) {
    initials = pickBest(initials, {
      value: labeledInitials.replace(/[^A-Z]/g, ''),
      score: 0.82,
      source: `${source}:label-initials`
    });
  }

  const labeledSurname = normalizeSpaces((joined.match(/(?:surname|last\s*name|family\s*name)\s*[:#-]?\s*([^\n]+)/i)?.[1] ?? '').toUpperCase());
  if (labeledSurname) {
    surname = pickBest(surname, {
      value: labeledSurname.replace(/[^A-Z'-]/g, ''),
      score: 0.82,
      source: `${source}:label-surname`
    });
  }

  const labeledIdRaw = normalizeSpaces((joined.match(/(?:id\s*no\.?|identity\s*number|id\s*number)\s*[:#-]?\s*([0-9OQI\s\/-]{8,22})/i)?.[1] ?? ''));
  const labeledIdDigits = toDigits(labeledIdRaw);
  const fallbackIdDigits = toDigits(joined.match(/\b[0-9OQI\/-\s]{13,22}\b/)?.[0] ?? '');
  const bestIdDigits = labeledIdDigits || fallbackIdDigits;
  if (bestIdDigits) {
    const normalizedId = bestIdDigits.length > 13 ? bestIdDigits.slice(-13) : bestIdDigits.slice(0, 13);
    const score = normalizedId.length === 13 ? (labeledIdDigits ? 0.92 : 0.78) : 0.5;
    idNumber = pickBest(idNumber, {
      value: normalizedId,
      score,
      source: labeledIdDigits ? `${source}:label-id` : `${source}:pattern-id`
    });
  }

  const labeledLicenseRaw = normalizeSpaces((joined.match(/(?:driver\s*(?:licen[cs]e|permit)\s*(?:number|no\.?)?|licen[cs]e\s*number|licen[cs]e\s*no\.?)\s*[:#-]?\s*([^\n]+)/i)?.[1] ?? ''));
  const labeledLicense = toAlphaNum(labeledLicenseRaw);
  const fallbackLicense = toAlphaNum(
    lines.find((line) => /[A-Z0-9]{7,}/i.test(line) && !/ID\s*NO|BIRTH|VALID|ISSUED|SOUTH|AFRICA/i.test(line)) ?? ''
  );
  const bestLicense = labeledLicense || fallbackLicense;
  if (bestLicense) {
    const hasLetter = /[A-Z]/.test(bestLicense);
    const hasNumber = /[0-9]/.test(bestLicense);
    const score = labeledLicense
      ? 0.88
      : (hasLetter && hasNumber ? 0.74 : 0.6);
    licenseNumber = pickBest(licenseNumber, {
      value: bestLicense,
      score,
      source: labeledLicense ? `${source}:label-license` : `${source}:pattern-license`
    });
  }

  const labeledBirth = normalizeDate(normalizeSpaces((joined.match(/(?:date\s*of\s*birth|birth|dob)\s*[:#-]?\s*([^\n]+)/i)?.[1] ?? '')));
  if (labeledBirth) {
    dob = pickBest(dob, { value: labeledBirth, score: 0.86, source: `${source}:label-dob` });
  }

  const dateCandidates = extractDateCandidates(joined);
  const validRange = joined.match(/valid[^\n]*?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})[^\n]*?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
  const validExpiry = validRange?.[2] ? normalizeDate(validRange[2]) : '';
  const labeledExpiry = normalizeDate(normalizeSpaces((joined.match(/(?:expiry\s*date|valid\s*until|expires|valid\s*to)\s*[:#-]?\s*([^\n]+)/i)?.[1] ?? '')));
  const sortedCandidates = [...dateCandidates].sort();
  const fallbackExpiry = sortedCandidates.length > 0 ? sortedCandidates[sortedCandidates.length - 1] : '';
  const bestExpiry = validExpiry || labeledExpiry || fallbackExpiry;
  if (bestExpiry) {
    const score = validExpiry ? 0.9 : (labeledExpiry ? 0.82 : 0.62);
    expiryDate = pickBest(expiryDate, {
      value: bestExpiry,
      score,
      source: validExpiry ? `${source}:valid-range` : (labeledExpiry ? `${source}:label-expiry` : `${source}:pattern-expiry`)
    });
  }

  const codeLabelRaw = normalizeSpaces((joined.match(/(?:codes?|categories|class)\s*[:#-]?\s*([^\n]+)/i)?.[1] ?? ''));
  const codeLabel = toAlphaNum(codeLabelRaw);
  const codeFallback = toAlphaNum(lines.find((line) => /^([A-Z]{1,2}\d?)$/.test(toAlphaNum(line))) ?? '');
  const bestCode = codeLabel || codeFallback;
  if (bestCode) {
    licenseCodes = pickBest(licenseCodes, {
      value: bestCode,
      score: codeLabel ? 0.74 : 0.56,
      source: codeLabel ? `${source}:label-code` : `${source}:pattern-code`
    });
  }

  return { initials, surname, name, idNumber, licenseNumber, dob, expiryDate, licenseCodes };
}

async function makeFastVariants(base64Image: string, retryMode: boolean): Promise<Array<{ name: string; buffer: Buffer }>> {
  const raw = Buffer.from(base64Image, 'base64');

  const oriented = await sharp(raw, { failOn: 'none' })
    .autoOrient()
    .resize({ width: 1400, withoutEnlargement: true })
    .toBuffer();

  const normalized = await sharp(oriented)
    .normalize()
    .grayscale()
    .sharpen({ sigma: 1.1 })
    .toBuffer();

  const variants: Array<{ name: string; buffer: Buffer }> = [{ name: 'pass_full', buffer: normalized }];

  const darkBoost = await sharp(oriented)
    .grayscale()
    .gamma(1.45)
    .linear(1.25, -16)
    .normalize()
    .sharpen({ sigma: 1.4 })
    .toBuffer();
  variants.push({ name: 'pass_dark_boost', buffer: darkBoost });

  // Isolate yellow-highlighted ink (common evidence markup) to OCR marked values only.
  const highlightMask = await sharp(oriented)
    .recomb([
      [1.1, 1.05, -1.35],
      [1.1, 1.05, -1.35],
      [1.1, 1.05, -1.35]
    ])
    .normalize()
    .grayscale()
    .threshold(142)
    .toBuffer();
  variants.push({ name: 'pass_highlight_mask', buffer: highlightMask });

  const metadata = await sharp(normalized).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width > 0 && height > 0) {
    const extract = {
      left: Math.max(0, Math.floor(width * 0.06)),
      top: Math.max(0, Math.floor(height * 0.1)),
      width: Math.max(120, Math.floor(width * 0.88)),
      height: Math.max(96, Math.floor(height * 0.78))
    };

    const textBand = await sharp(normalized).extract(extract).normalize().sharpen().toBuffer();
    variants.push({ name: 'pass_text_band', buffer: textBand });

    const highlightBand = await sharp(highlightMask)
      .extract(extract)
      .median(1)
      .sharpen({ sigma: 1.3 })
      .toBuffer();
    variants.push({ name: 'pass_highlight_band', buffer: highlightBand });

    if (retryMode) {
      const retryBand = await sharp(textBand).linear(1.22, -10).median(1).toBuffer();
      variants.push({ name: 'retry_text_band_boost', buffer: retryBand });

      const retryBinary = await sharp(retryBand)
        .threshold(152)
        .toBuffer();
      variants.push({ name: 'retry_text_band_binary', buffer: retryBinary });
    }
  }

  return variants;
}

async function runOcrPasses(variants: Array<{ name: string; buffer: Buffer }>): Promise<OcrPassResult[]> {
  const worker = await getWorker();
  const passes: OcrPassResult[] = [];
  for (const variant of variants) {
    const result = await worker.recognize(variant.buffer);
    passes.push({
      name: variant.name,
      text: result.data.text ?? '',
      confidence: Number(result.data.confidence ?? 0)
    });
  }
  return passes;
}

async function runHighlightedOnlyPass(base64Image: string): Promise<OcrPassResult[] | null> {
  const raw = Buffer.from(base64Image, 'base64');
  const highlighted = await sharp(raw, { failOn: 'none' })
    .autoOrient()
    .resize({ width: 1200, withoutEnlargement: true })
    .recomb([
      [1.1, 1.05, -1.35],
      [1.1, 1.05, -1.35],
      [1.1, 1.05, -1.35]
    ])
    .normalize()
    .grayscale()
    .threshold(140)
    .median(1)
    .sharpen({ sigma: 1.3 })
    .toBuffer();

  const worker = await getWorker();
  const result = await withTimeout(worker.recognize(highlighted), 5_000).catch(() => null);
  if (!result) return null;

  return [{
    name: 'highlight_only_pass',
    text: result.data.text ?? '',
    confidence: Number(result.data.confidence ?? 0)
  }];
}

async function runEmergencyNightPass(base64Image: string): Promise<OcrPassResult[] | null> {
  const raw = Buffer.from(base64Image, 'base64');
  const emergency = await sharp(raw, { failOn: 'none' })
    .autoOrient()
    .resize({ width: 1100, withoutEnlargement: true })
    .grayscale()
    .gamma(1.55)
    .linear(1.3, -20)
    .normalize()
    .sharpen({ sigma: 1.2 })
    .toBuffer();

  const worker = await getWorker();
  const result = await withTimeout(worker.recognize(emergency), 5_000).catch(() => null);
  if (!result) return null;

  return [{
    name: 'emergency_night_pass',
    text: result.data.text ?? '',
    confidence: Number(result.data.confidence ?? 0)
  }];
}

function buildFastLocalResult(passes: OcrPassResult[]): { data: DriverLicenseData; scoreMap: Record<string, number>; overall: number } {
  const aggregate = {
    initials: emptyCandidate('none'),
    surname: emptyCandidate('none'),
    idNumber: emptyCandidate('none'),
    licenseNumber: emptyCandidate('none'),
    expiryDate: emptyCandidate('none'),
    dob: emptyCandidate('none')
  };

  for (const pass of passes) {
    const parsed = parseRequiredFields(pass.text, pass.confidence, pass.name);
    aggregate.initials = pickBest(aggregate.initials, parsed.initials);
    aggregate.surname = pickBest(aggregate.surname, parsed.surname);
    aggregate.idNumber = pickBest(aggregate.idNumber, parsed.idNumber);
    aggregate.licenseNumber = pickBest(aggregate.licenseNumber, parsed.licenseNumber);
    aggregate.expiryDate = pickBest(aggregate.expiryDate, parsed.expiryDate);
    aggregate.dob = pickBest(aggregate.dob, parsed.dob);
  }

  const scoreMap = {
    initials: aggregate.initials.score,
    surname: aggregate.surname.score,
    idNumber: aggregate.idNumber.score,
    licenseNumber: aggregate.licenseNumber.score,
    expiryDate: aggregate.expiryDate.score,
    dob: aggregate.dob.score,
    idOrLicense: Math.max(aggregate.idNumber.score, aggregate.licenseNumber.score)
  };

  const overall = (
    scoreMap.initials +
    scoreMap.surname +
    scoreMap.idOrLicense +
    scoreMap.expiryDate
  ) / 4;

  return {
    data: {
      name: aggregate.initials.value,
      surname: aggregate.surname.value,
      initials: aggregate.initials.value,
      idNumber: aggregate.idNumber.value,
      licenseNumber: aggregate.licenseNumber.value,
      dob: aggregate.dob.value,
      expiryDate: aggregate.expiryDate.value,
      licenseCodes: ''
    },
    scoreMap,
    overall
  };
}

function isStrictlyValid(result: DriverLicenseData, scores: Record<string, number>, retryMode: boolean): boolean {
  const initialsOk = /^[A-Z]{1,3}$/.test(result.initials) && scores.initials >= 0.55;
  const surnameOk = /^[A-Z][A-Z'\-]{2,}$/.test(result.surname) && scores.surname >= 0.62;
  const expiryOk = /^\d{4}-\d{2}-\d{2}$/.test(result.expiryDate) && scores.expiryDate >= 0.62;

  const idOk = /^\d{13}$/.test(result.idNumber) && scores.idNumber >= 0.66;
  const licenseOk = /^[A-Z0-9]{6,16}$/.test(result.licenseNumber) && scores.licenseNumber >= 0.66;
  const identityOk = idOk || licenseOk;

  const overallThreshold = retryMode ? 0.64 : 0.68;
  const overall = (scores.initials + scores.surname + Math.max(scores.idNumber, scores.licenseNumber) + scores.expiryDate) / 4;
  return initialsOk && surnameOk && expiryOk && identityOk && overall >= overallThreshold;
}

router.post('/', asyncHandler(async (req, res) => {
  const base64Image = typeof req.body?.base64Image === 'string' ? req.body.base64Image : '';
  const retryMode = req.body?.retry === true;
  const highlightOnly = req.body?.highlightOnly === true;
  if (!base64Image) {
    return res.status(400).json({ error: 'A front-of-licence image is required.' });
  }
  if (base64Image.length > 8_000_000) {
    return res.status(413).json({ error: 'Licence image is too large.' });
  }

  const timeoutMs = retryMode ? 40_000 : 24_000;
  const variants = highlightOnly ? [] : await makeFastVariants(base64Image, retryMode);
  const timedPasses = highlightOnly
    ? null
    : await withTimeout(runOcrPasses(variants), timeoutMs).catch(() => null);
  const highlightPasses = timedPasses ? null : await runHighlightedOnlyPass(base64Image);
  const emergencyPasses = timedPasses || highlightPasses ? null : await runEmergencyNightPass(base64Image);
  const passes = timedPasses ?? highlightPasses ?? emergencyPasses;
  if (!passes) {
    return res.status(422).json({
      error: 'Scan timed out. Retake in steadier light or use retry mode for darker captures.',
      hint: 'Night captures are supported, but avoid motion blur and severe glare.'
    });
  }

  const local = buildFastLocalResult(passes);
  const valid = isStrictlyValid(local.data, local.scoreMap, retryMode);

  const ocrDebug: OcrDebug = {
    overallConfidence: Number(local.overall.toFixed(3)),
    fieldConfidence: {
      initials: Number(local.scoreMap.initials.toFixed(3)),
      surname: Number(local.scoreMap.surname.toFixed(3)),
      idNumber: Number(local.scoreMap.idNumber.toFixed(3)),
      licenseNumber: Number(local.scoreMap.licenseNumber.toFixed(3)),
      expiryDate: Number(local.scoreMap.expiryDate.toFixed(3)),
      dob: Number(local.scoreMap.dob.toFixed(3)),
      idOrLicense: Number(local.scoreMap.idOrLicense.toFixed(3))
    },
    passes: passes.slice(0, 8).map((pass) => ({
      name: pass.name,
      confidence: Number((pass.confidence / 100).toFixed(3)),
      preview: normalizeSpaces(pass.text).slice(0, 140)
    })),
    usedPaidFallback: false,
    fallbackReason: timedPasses
      ? (retryMode
        ? 'Retry mode enabled stronger local preprocessing only.'
        : 'Fast mode: no paid fallback on first attempt.')
      : (highlightPasses
        ? 'Primary OCR timed out; used highlighted-values fallback.'
        : 'Primary OCR timed out; used emergency night pass fallback.')
  };

  const response: ScanResponse = {
    ...local.data,
    _ocr: ocrDebug
  };

  if (!valid) {
    return res.status(422).json({
      error: 'Low confidence capture. Retake in good light, avoid glare, and fill the frame with the card.',
      partial: response
    });
  }

  return res.json(response);
}));

export default router;
