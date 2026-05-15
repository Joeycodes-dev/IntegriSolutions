import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import { AuthProvider } from '../../src/lib/AuthContext';
import * as api from '../../src/services/api';

const mockProfile = {
  uid: 'supervisor-1',
  officerId: 99,
  email: 'supervisor@test.com',
  name: 'Jane',
  surname: 'Doe',
  badgeNumber: 'S001',
  idNumber: 'ID001',
  employmentStatus: 'Active',
  province: 'Gauteng',
  region: 'Johannesburg',
  officerTypeId: 1,
  roleId: 1,
  createdAt: '2026-01-01T00:00:00Z',
};

const mockTests = [
  {
    id: 'test-1',
    officerId: 1,
    officerName: 'Officer One',
    badgeNumber: 'B001',
    driverName: 'Driver A',
    driverId: 'DL001',
    bacReading: 0.08,
    result: 'fail' as const,
    createdAt: '2026-05-15T10:00:00Z',
  },
];

describe('Login → Dashboard end-to-end flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs in and renders dashboard with real data', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({
      session: { access_token: 'test-jwt-token' },
      profile: mockProfile,
    });
    vi.spyOn(api, 'getProfile').mockResolvedValue(mockProfile);
    vi.spyOn(api, 'getTests').mockResolvedValue(mockTests);

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    // Login form is visible
    expect(screen.getByRole('button', { name: /Login to Portal/i })).toBeInTheDocument();

    // Fill in credentials
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'supervisor@test.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });

    // Submit login
    fireEvent.click(screen.getByRole('button', { name: /Login to Portal/i }));

    // Dashboard loads with data
    await waitFor(() => {
      expect(screen.getByText('Driver A')).toBeInTheDocument();
    });

    // Summary stats are computed from real data
    expect(screen.getByText('Roadside stops').closest('div')?.querySelector('p.text-4xl')).toHaveTextContent('1');
    expect(screen.getByText('DUI')).toBeInTheDocument();
  });

  it('dev mode bypasses backend and shows dashboard', async () => {
    vi.spyOn(api, 'getTests').mockResolvedValue([]);

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    // Enable dev mode
    const devCheckbox = screen.getByLabelText(/Developer bypass login/i);
    fireEvent.click(devCheckbox);

    // Fill in any email
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'dev@test.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'any' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Login to Portal/i }));

    // Dashboard appears with empty state
    await waitFor(() => {
      expect(screen.getByText(/No test records found/i)).toBeInTheDocument();
    });
  });
});
