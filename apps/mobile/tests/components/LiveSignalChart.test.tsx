import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { LiveSignalChart } from '../../src/components/LiveSignalChart';
import { computeSignalScale, describeSignal, type SignalSample } from '../../src/lib/signalChart';
import { colors } from '../../src/styles/colors';

function makeSamples(values: number[], over = false, at = 1_000): SignalSample[] {
  return values.map((value) => ({ value, over, at }));
}

describe('LiveSignalChart', () => {
  it('shows the empty state while there is nothing to draw', () => {
    render(<LiveSignalChart samples={[]} />);

    expect(screen.getByText('Waiting for readings…')).toBeTruthy();
    expect(screen.queryAllByTestId(/live-signal-chart-bar-\d+/)).toHaveLength(0);
    expect(screen.queryByTestId('live-signal-chart-live-dot')).toBeNull();
    expect(screen.getByTestId('live-signal-chart').props.accessibilityLabel).toBe(
      'Live signal chart. No readings yet.'
    );
  });

  it('renders one bar per sample', () => {
    render(<LiveSignalChart samples={makeSamples([100, 104, 108, 112, 116])} />);

    expect(screen.getAllByTestId(/live-signal-chart-bar-\d+/)).toHaveLength(5);
    expect(screen.getByTestId('live-signal-chart-bar-0')).toBeTruthy();
    expect(screen.getByTestId('live-signal-chart-bar-4')).toBeTruthy();
  });

  it('keeps the full window of samples on screen', () => {
    render(<LiveSignalChart samples={makeSamples(Array.from({ length: 60 }, (_, index) => 120 + index))} />);

    expect(screen.getAllByTestId(/live-signal-chart-bar-\d+/)).toHaveLength(60);
  });

  it('colours bars by class and marks only the newest sample with a live dot', () => {
    render(<LiveSignalChart samples={makeSamples([120, 140, 150])} baseline={120} />);

    expect(screen.getByTestId('live-signal-chart-bar-0')).toHaveStyle({
      backgroundColor: colors.neutralGray
    });
    expect(screen.getByTestId('live-signal-chart-bar-1')).toHaveStyle({
      backgroundColor: colors.accentBlue
    });
    expect(screen.getByTestId('live-signal-chart-bar-2')).toHaveStyle({
      backgroundColor: colors.accentBlue
    });
    expect(screen.getAllByTestId('live-signal-chart-live-dot')).toHaveLength(1);
  });

  it('keeps the error colour on the newest bar when it is over the alarm level', () => {
    render(
      <LiveSignalChart
        samples={[
          { value: 300, over: false, at: 1000 },
          { value: 300, over: true, at: 1001 }
        ]}
        baseline={120}
      />
    );

    expect(screen.getByTestId('live-signal-chart-bar-0')).toHaveStyle({
      backgroundColor: colors.accentBlue
    });
    expect(screen.getByTestId('live-signal-chart-bar-1')).toHaveStyle({
      backgroundColor: colors.error
    });
    expect(screen.getByTestId('live-signal-chart-live-dot')).toBeTruthy();
  });

  it('auto-scales bar heights instead of drawing a fixed 0-1023 scale', () => {
    render(<LiveSignalChart samples={makeSamples([140, 152])} height={120} />);

    const bars = screen.getAllByTestId(/live-signal-chart-bar-\d+/);
    const heights = bars.map((bar) => bar.props.style[1].height as number);

    // A 12-count spread fills the 94px bar area (120px plot less border, padding and the live-dot reserve)
    // instead of 1% of a 1023-count axis.
    expect(computeSignalScale([140, 152])).toEqual({ low: 126, high: 166 });
    expect(heights).toEqual([34, 62]);
  });

  it('describes itself for screen readers', () => {
    const samples = makeSamples([118, 130, 142], false, 1_000);
    render(<LiveSignalChart samples={samples} baseline={120} />);

    expect(screen.getByTestId('live-signal-chart').props.accessibilityLabel).toBe(
      describeSignal(samples, 120)
    );
  });

  it('draws the clean-air line and legend entry when the baseline sits inside the scale', () => {
    render(<LiveSignalChart samples={makeSamples([120, 130, 140])} baseline={125} />);

    expect(screen.getByTestId('live-signal-chart-baseline')).toBeTruthy();
    expect(screen.getByTestId('live-signal-chart-baseline-key')).toBeTruthy();
    expect(screen.getByText('Clean-air level')).toBeTruthy();
  });

  it('hides the clean-air line when the baseline is outside the scale', () => {
    render(<LiveSignalChart samples={makeSamples([120, 130, 140])} baseline={900} />);

    expect(screen.queryByTestId('live-signal-chart-baseline')).toBeNull();
    expect(screen.queryByText('Clean-air level')).toBeNull();
  });

  it('honours a custom test id and height', () => {
    render(<LiveSignalChart samples={makeSamples([100, 140])} testID="breath-plot" height={200} />);

    expect(screen.getByTestId('breath-plot-bar-0')).toBeTruthy();
    expect(screen.getByTestId('breath-plot-plot')).toHaveStyle({ height: 200 });
  });

  it('labels the y-axis with the scaled range and keeps the footer legend', () => {
    render(<LiveSignalChart samples={makeSamples([100, 140])} />);

    expect(screen.getByText('145')).toBeTruthy();
    expect(screen.getByText('95')).toBeTruthy();
    expect(screen.getByText('Resting')).toBeTruthy();
    expect(screen.getByText('Rising')).toBeTruthy();
    expect(screen.getByText('Over alarm level')).toBeTruthy();
    expect(screen.getByText(/^Last \d+ s$/)).toBeTruthy();
  });

  it('hides the window label until there are two samples', () => {
    render(<LiveSignalChart samples={[{ value: 120, over: false, at: 1_000 }]} />);

    expect(screen.queryByText(/^Last \d+ s$/)).toBeNull();
  });
});
