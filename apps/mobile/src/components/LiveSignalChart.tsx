import React from 'react';
import { Text, View } from 'react-native';

import {
  barHeight,
  classifySignalSample,
  computeSignalScale,
  describeSignal,
  signalWindowSeconds,
  type SignalClass,
  type SignalSample
} from '../lib/signalChart';
import { colors } from '../styles/colors';
import { styles } from './LiveSignalChart.styles';

export interface LiveSignalChartProps {
  samples: readonly SignalSample[];
  baseline?: number | null; // clean-air reference in ADC counts
  height?: number; // plot height in px, default 120
  testID?: string; // default 'live-signal-chart'
}

const DEFAULT_PLOT_HEIGHT = 120;
const PLOT_PADDING = 8;
const PLOT_BORDER = 1;
const BAR_MIN_HEIGHT = 2;
// Room kept above the tallest bar for the live dot marking the newest sample.
const LIVE_DOT_RESERVE = 8;
const EMPTY_MESSAGE = 'Waiting for readings…';

const CLASS_COLORS: Record<SignalClass, string> = {
  resting: colors.neutralGray,
  rising: colors.accentBlue,
  over: colors.error
};

const LEGEND_ITEMS: Array<{ key: SignalClass; label: string }> = [
  { key: 'resting', label: 'Resting' },
  { key: 'rising', label: 'Rising' },
  { key: 'over', label: 'Over alarm level' }
];

/**
 * Auto-scaling bar chart for raw breathalyser ADC telemetry. Heights stretch to
 * the reading range instead of a fixed 0–1023 scale, so a few counts of real
 * change are as visible as a large swing.
 */
export function LiveSignalChart(props: LiveSignalChartProps) {
  const { samples, baseline, height = DEFAULT_PLOT_HEIGHT, testID = 'live-signal-chart' } = props;

  const baselineValue =
    typeof baseline === 'number' && Number.isFinite(baseline) ? baseline : null;
  const values = samples
    .filter((sample) => Number.isFinite(sample.value))
    .map((sample) => sample.value);
  const hasValues = values.length > 0;
  const scale = computeSignalScale(values, baselineValue);
  const windowSeconds = signalWindowSeconds(samples);

  // Bars and the clean-air line share one mapping, measured inside the plot's
  // border and padding, so a bar exactly at the baseline meets the dashed line.
  const innerHeight = Math.max(1, height - (PLOT_PADDING + PLOT_BORDER) * 2);
  const barAreaHeight = Math.max(BAR_MIN_HEIGHT + 1, innerHeight - LIVE_DOT_RESERVE);
  const showBaseline =
    hasValues && baselineValue !== null && baselineValue >= scale.low && baselineValue <= scale.high;
  const baselineOffset =
    baselineValue !== null && showBaseline
      ? Math.round(barHeight(baselineValue, scale, barAreaHeight, BAR_MIN_HEIGHT))
      : 0;
  const newestIndex = samples.length - 1;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeSignal(samples, baselineValue)}
      testID={testID}
    >
      <View style={styles.plotRow}>
        <View style={styles.yAxis}>
          <Text style={styles.yAxisLabel}>{hasValues ? scale.high : ''}</Text>
          <Text style={styles.yAxisLabel}>{hasValues ? scale.low : ''}</Text>
        </View>
        <View style={[styles.plot, { height }]} testID={`${testID}-plot`}>
          {hasValues ? (
            <View style={styles.bars}>
              {samples.map((sample, index) => {
                const signalClass = classifySignalSample(sample, baselineValue);
                return (
                  <View key={`${testID}-slot-${index}`} style={styles.barSlot}>
                    {index === newestIndex ? (
                      <View testID={`${testID}-live-dot`} style={styles.liveDot} />
                    ) : null}
                    <View
                      testID={`${testID}-bar-${index}`}
                      style={[
                        styles.bar,
                        {
                          height: Math.round(
                            barHeight(sample.value, scale, barAreaHeight, BAR_MIN_HEIGHT)
                          ),
                          backgroundColor: CLASS_COLORS[signalClass]
                        }
                      ]}
                    />
                  </View>
                );
              })}
              {baselineValue !== null && showBaseline ? (
                <View
                  testID={`${testID}-baseline`}
                  style={[styles.baselineLine, { bottom: baselineOffset }]}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{EMPTY_MESSAGE}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.footer}>
        <View style={styles.legend}>
          {LEGEND_ITEMS.map((item) => (
            <View key={item.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CLASS_COLORS[item.key] }]} />
              <Text style={styles.legendLabel}>{item.label}</Text>
            </View>
          ))}
          {baselineValue !== null && showBaseline ? (
            <View style={styles.legendItem}>
              <View testID={`${testID}-baseline-key`} style={styles.legendDashed} />
              <Text style={styles.legendLabel}>Clean-air level</Text>
            </View>
          ) : null}
        </View>
        {windowSeconds !== null ? (
          <Text style={styles.windowLabel}>{`Last ${windowSeconds} s`}</Text>
        ) : null}
      </View>
    </View>
  );
}
