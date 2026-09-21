import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ResultPieChart } from '../../src/components/supervisor/ReportCharts';

describe('ResultPieChart', () => {
  it('renders at a size large enough to look balanced in a normalized chart card (not "tiny")', () => {
    const { container } = render(<ResultPieChart passed={7} failed={3} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Previously hard-coded to 160px, which looked tiny once the card's
    // height was normalized alongside its taller DUI Trends row sibling.
    expect(svg).toHaveStyle({ height: '230px' });
    expect(svg?.getAttribute('class')).toContain('max-w-[230px]');
  });

  it('still reflects the pass/fail totals in the accessible label regardless of rendered size', () => {
    const { container } = render(<ResultPieChart passed={7} failed={3} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Result breakdown: 7 passed, 3 failed, failure rate 30 percent');
  });
});
