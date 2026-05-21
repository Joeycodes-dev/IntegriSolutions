import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import { AuthProvider } from '../../src/lib/AuthContext';
import * as api from '../../src/services/api';

vi.mock('../../src/components/SplashScreen', () => ({
  SplashScreen: ({ onComplete }: { onComplete: () => void }) => {
    Promise.resolve().then(() => onComplete());
    return null;
  },
}));

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
  roleId: 2,
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

describe('Login - Dashboard end-to-end flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('logs in and renders dashboard with test data', async () => {
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

    // Wait for splash to resolve and login to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Login$/i })).toBeInTheDocument();
    });

    // Fill in credentials
    fireEvent.change(screen.getByLabelText(/Work Email/i), { target: { value: 'supervisor@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });

    // Submit login
    fireEvent.click(screen.getByRole('button', { name: /^Login$/i }));

    // Overview dashboard visible with test data
    await waitFor(() => {
      expect(screen.getByText('Overview Dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('TOTAL TESTS')).toBeInTheDocument();
    expect(screen.getByText('TOTAL FAILURES')).toBeInTheDocument();

    // Navigate to Logs tab to verify test records rendered
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    await waitFor(() => {
      expect(screen.getByText('DL001')).toBeInTheDocument();
    });
  });

  it('dev mode bypasses backend and shows dashboard', async () => {
    vi.spyOn(api, 'getTests').mockResolvedValue([]);

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Developer bypass login/i)).toBeInTheDocument();
    });

    // Enable dev mode
    const devCheckbox = screen.getByLabelText(/Developer bypass login/i);
    fireEvent.click(devCheckbox);

    // Fill in any email
    fireEvent.change(screen.getByLabelText(/Work Email/i), { target: { value: 'dev@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'any' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /^Login$/i }));

    // Navigate to Logs tab to see empty state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Logs' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    await waitFor(() => {
      expect(screen.getByText(/No test records found/i)).toBeInTheDocument();
    });
  });
});
