import { StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  plotRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8
  },
  yAxis: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  yAxisLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  plot: {
    flex: 1,
    backgroundColor: colors.pageBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    padding: 8,
    overflow: 'hidden'
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2
  },
  barSlot: {
    flex: 1,
    minWidth: 2,
    maxWidth: 4,
    justifyContent: 'flex-end'
  },
  bar: {
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5
  },
  liveDot: {
    alignSelf: 'center',
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 2,
    backgroundColor: colors.primaryDark
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyStateText: {
    color: colors.neutralGray,
    fontSize: 12,
    fontWeight: '600'
  },
  baselineLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textSecondary
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    flexShrink: 1,
    columnGap: 10,
    rowGap: 4
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  legendDashed: {
    width: 12,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textSecondary
  },
  legendLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  windowLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  }
});
