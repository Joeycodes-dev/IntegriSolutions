import type { OperationalAlertPriority } from '../types';
import { colors } from '../styles/colors';

export interface AlertPriorityStyle {
  /** Card/banner background wash. */
  background: string;
  /** Card/banner border. */
  border: string;
  /** Solid accent used for the priority pill and the Acknowledge button —
   * chosen dark enough to keep white text on it AA-contrast accessible. */
  accent: string;
  /** Accent-tinted text/icon color for use directly on the light
   * background (banner label, View Details button). */
  labelText: string;
}

/**
 * Maps an operational alert's priority to its visual treatment (shared by
 * the Home banner and the Alerts screen pills — keep this the single
 * source of truth for both). Deliberately avoids red for ordinary
 * High-priority alerts — red is reserved for Critical, the genuine
 * immediate-emergency / officer-safety / life-safety tier, so a routine
 * urgent BOLO/hazard notice (High) is never visually confused with an
 * emergency. Critical is the strongest, most attention-grabbing treatment;
 * High still reads as prominent via a strong amber/orange accent; Medium is
 * a softer yellow/gold; Low is a calm blue/neutral tone.
 *
 * Colour driven purely by priority — this function has no opinion on
 * whether/when to interrupt a workflow. See homeAlertsSummary.ts and
 * AlertsContext.tsx: workflow state (e.g. an active capture step) controls
 * interruption, priority only controls prominence once something is shown.
 */
export function alertPriorityStyle(priority: OperationalAlertPriority): AlertPriorityStyle {
  if (priority === 'critical') {
    return {
      background: colors.errorBackground,
      border: colors.errorBorder,
      accent: colors.error,
      labelText: colors.errorText
    };
  }
  if (priority === 'high') {
    return {
      background: colors.alertHighBackground,
      border: colors.alertHighBorder,
      accent: colors.alertHighAccent,
      labelText: colors.alertHighAccent
    };
  }
  if (priority === 'medium') {
    return {
      background: colors.alertMediumBackground,
      border: colors.alertMediumBorder,
      accent: colors.alertMediumAccent,
      labelText: colors.alertMediumAccent
    };
  }
  return {
    background: colors.alertLowBackground,
    border: colors.alertLowBorder,
    accent: colors.alertLowAccent,
    labelText: colors.alertLowAccent
  };
}
