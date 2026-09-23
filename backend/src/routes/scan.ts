import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { readJson } from '../utilities/jsonBody';
import type { AppEnv } from '../env';

const router = new Hono<AppEnv>();

// The mobile app runs OCR on-device (ML Kit / Apple Vision) and posts the raw
// text here; this route only parses fields and scores confidence.
const MAX_TEXT_LENGTH = 200_000;
const ON_DEVICE_PASS_CONFIDENCE = 85;

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
  engine: 'ml-kit';
  overallConfidence: number;
  fieldConfidence: Record<string, number>;
  passes: Array<{ name: string; confidence: number; preview: string }>;
  usedPaidFallback: boolean;
  fallbackReason: string | null;
}

type ScanResponse = DriverLicenseData & { _ocr: OcrDebug };

type BuiltOcrResult = { data: DriverLicenseData; scoreMap: Record<string, number>; overall: number };

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

function buildFastLocalResult(passes: OcrPassResult[]): BuiltOcrResult {
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

function fieldConfidence(scoreMap: Record<string, number>): Record<string, number> {
  return {
    initials: Number(scoreMap.initials.toFixed(3)),
    surname: Number(scoreMap.surname.toFixed(3)),
    idNumber: Number(scoreMap.idNumber.toFixed(3)),
    licenseNumber: Number(scoreMap.licenseNumber.toFixed(3)),
    expiryDate: Number(scoreMap.expiryDate.toFixed(3)),
    dob: Number(scoreMap.dob.toFixed(3)),
    idOrLicense: Number(scoreMap.idOrLicense.toFixed(3))
  };
}

function debugPasses(passes: OcrPassResult[]): OcrDebug['passes'] {
  return passes.slice(0, 8).map((pass) => ({
    name: pass.name,
    confidence: Number((pass.confidence / 100).toFixed(3)),
    preview: normalizeSpaces(pass.text).slice(0, 140)
  }));
}

function buildScanResponse(local: BuiltOcrResult, passes: OcrPassResult[]): ScanResponse {
  return {
    ...local.data,
    _ocr: {
      engine: 'ml-kit',
      overallConfidence: Number(local.overall.toFixed(3)),
      fieldConfidence: fieldConfidence(local.scoreMap),
      passes: debugPasses(passes),
      usedPaidFallback: false,
      fallbackReason: null
    }
  };
}

router.post('/', requireAuth, async (c) => {
  const body = await readJson<{ text?: string; retry?: boolean }>(c);
  const text = typeof body.text === 'string' ? body.text : '';
  const retryMode = body.retry === true;

  if (!text.trim()) {
    return c.json({ error: 'A front-of-licence text scan is required.' }, 400);
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return c.json({ error: 'Licence scan text is too large.' }, 413);
  }

  const passes: OcrPassResult[] = [{ name: 'mlkit', text, confidence: ON_DEVICE_PASS_CONFIDENCE }];
  const local = buildFastLocalResult(passes);
  const response = buildScanResponse(local, passes);

  if (!isStrictlyValid(local.data, local.scoreMap, retryMode)) {
    return c.json({
      error: 'Low confidence capture. Retake in good light, avoid glare, and fill the frame with the card.',
      partial: response
    }, 422);
  }

  return c.json(response);
});

export default router;
