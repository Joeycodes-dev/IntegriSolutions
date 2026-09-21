import { alertPriorityStyle } from '../../src/lib/alertPriorityStyle';
import { colors } from '../../src/styles/colors';

describe('alertPriorityStyle', () => {
  it('maps Critical to the red/error accent — the reserved emergency tier', () => {
    const style = alertPriorityStyle('critical');
    expect(style.accent).toBe(colors.error);
    expect(style.background).toBe(colors.errorBackground);
    expect(style.border).toBe(colors.errorBorder);
  });

  it('maps High to the strong amber/orange accent, never red', () => {
    const style = alertPriorityStyle('high');
    expect(style.accent).toBe(colors.alertHighAccent);
    expect(style.background).toBe(colors.alertHighBackground);
    expect(style.border).toBe(colors.alertHighBorder);
    // Explicitly must not reuse the error/red palette for ordinary High alerts
    // — red is reserved for Critical.
    expect(style.accent).not.toBe(colors.error);
    expect(style.background).not.toBe(colors.errorBackground);
    expect(style.border).not.toBe(colors.errorBorder);
  });

  it('maps Medium to a softer yellow/gold accent, distinct from High', () => {
    const style = alertPriorityStyle('medium');
    expect(style.accent).toBe(colors.alertMediumAccent);
    expect(style.background).toBe(colors.alertMediumBackground);
    expect(style.border).toBe(colors.alertMediumBorder);
    expect(style.accent).not.toBe(colors.alertHighAccent);
    expect(style.accent).not.toBe(colors.error);
  });

  it('maps Low to a calm blue/neutral accent, distinct from High and Medium', () => {
    const style = alertPriorityStyle('low');
    expect(style.accent).toBe(colors.alertLowAccent);
    expect(style.background).toBe(colors.alertLowBackground);
    expect(style.border).toBe(colors.alertLowBorder);
    expect(style.accent).not.toBe(colors.alertHighAccent);
    expect(style.accent).not.toBe(colors.alertMediumAccent);
    expect(style.accent).not.toBe(colors.error);
  });

  it('gives every tier (including Critical) a distinct accent from every other tier', () => {
    const accents = new Set([
      alertPriorityStyle('critical').accent,
      alertPriorityStyle('high').accent,
      alertPriorityStyle('medium').accent,
      alertPriorityStyle('low').accent
    ]);
    expect(accents.size).toBe(4);
  });

  it('reserves red exclusively for Critical', () => {
    expect(alertPriorityStyle('critical').accent).toBe(colors.error);
    expect(alertPriorityStyle('high').accent).not.toBe(colors.error);
    expect(alertPriorityStyle('medium').accent).not.toBe(colors.error);
    expect(alertPriorityStyle('low').accent).not.toBe(colors.error);
  });
});
