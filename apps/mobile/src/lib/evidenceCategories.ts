export const EVIDENCE_CATEGORIES = [
  'licence_front',
  'breathalyser_screen',
  'vehicle',
  'scene_note',
  'signature_witness'
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  licence_front: 'Licence Front',
  breathalyser_screen: 'Breathalyser Screen',
  vehicle: 'Vehicle',
  scene_note: 'Officer Scene Note',
  signature_witness: 'Signature / Witness'
};

export const EVIDENCE_CATEGORY_ORDER: EvidenceCategory[] = [...EVIDENCE_CATEGORIES];

export function isEvidenceCategory(value: unknown): value is EvidenceCategory {
  return (
    typeof value === 'string' &&
    (EVIDENCE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function evidenceCategoryLabel(category: unknown): string {
  return isEvidenceCategory(category) ? EVIDENCE_CATEGORY_LABELS[category] : 'General';
}
