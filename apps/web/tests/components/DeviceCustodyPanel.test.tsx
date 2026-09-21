import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceCustodyPanel } from '../../src/components/supervisor/DeviceCustodyPanel';
import type { TestDeviceCustody } from '../../src/types';

const baseTest = {
  id: 'test-123',
  officerId: 1,
  officerName: 'John Doe',
  badgeNumber: '12345',
  driverName: 'Jane Smith',
  driverId: '9876543210123',
  bacReading: 0.08,
  result: 'fail' as const,
  createdAt: '2026-05-30T10:00:00Z',
  hashValid: true
};

const device: TestDeviceCustody = {
  transport: 'ble',
  serial: 'MQ3-0042',
  calibrationVersion: 'mq3-default-v1+clean-air',
  calibrationR0: 7524.99,
  sessionPeakRaw: 812,
  avgRaw: 640,
  raw: 623,
  capturedAt: '2026-05-30T09:58:00Z'
};

describe('DeviceCustodyPanel', () => {
  it('renders device custody metadata for device-captured records', () => {
    render(<DeviceCustodyPanel test={{ ...baseTest, device }} />);

    expect(screen.getByText('Device Custody')).toBeInTheDocument();
    expect(screen.getByText('Bluetooth LE')).toBeInTheDocument();
    expect(screen.getByText('MQ3-0042')).toBeInTheDocument();
    expect(screen.getByText('mq3-default-v1+clean-air')).toBeInTheDocument();
    expect(screen.getByText('7525 Ω')).toBeInTheDocument();
    expect(screen.getByText('812 counts')).toBeInTheDocument();
    expect(screen.getByText('640 counts')).toBeInTheDocument();
    expect(screen.getByText('623 counts')).toBeInTheDocument();
    expect(
      screen.getByText(/Device metadata is covered by the verified record hash/i)
    ).toBeInTheDocument();
  });

  it('flags simulated devices and unknown serials', () => {
    render(
      <DeviceCustodyPanel
        test={{ ...baseTest, device: { ...device, transport: 'simulated', serial: null } }}
      />
    );

    expect(screen.getAllByText(/Simulated device/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Not reported')).toBeInTheDocument();
  });

  it('warns when the record hash failed verification', () => {
    render(<DeviceCustodyPanel test={{ ...baseTest, hashValid: false, device }} />);

    expect(screen.getByText(/custody data may have been altered/i)).toBeInTheDocument();
  });

  it('shows an empty state for records without device data', () => {
    render(<DeviceCustodyPanel test={{ ...baseTest, device: null }} />);

    expect(screen.getByText(/No breathalyzer custody data on this record/i)).toBeInTheDocument();
    expect(screen.queryByText('MQ3-0042')).not.toBeInTheDocument();
  });
});
