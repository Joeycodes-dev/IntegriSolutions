import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PublicVerificationPage } from '../../src/components/public/PublicVerificationPage';
import { getPublicVerification } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
  getPublicVerification: vi.fn()
}));

const mockVerified = {
  referenceId: 'IS-2026-05-30-001',
  hashStatus: 'verified' as const,
  timestamp: '2026-05-30T10:00:00Z',
  issuedAt: '2026-05-30T12:00:00Z',
  officerBadge: 'B001',
  driver: { name: 'J*** D**', id: '********9012' }
};

describe('PublicVerificationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches verification with the provided token', async () => {
    (getPublicVerification as any).mockResolvedValue(mockVerified);

    render(<PublicVerificationPage token="tok-123" />);

    await waitFor(() => {
      expect(getPublicVerification).toHaveBeenCalledWith('tok-123');
    });
  });

  it('shows verified state with the allowlisted details', async () => {
    (getPublicVerification as any).mockResolvedValue(mockVerified);

    render(<PublicVerificationPage token="tok-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Record verified/i)).toBeInTheDocument();
      expect(screen.getByText('IS-2026-05-30-001')).toBeInTheDocument();
      expect(screen.getByText('B001')).toBeInTheDocument();
      expect(screen.getByText('J*** D**')).toBeInTheDocument();
      expect(screen.getByText('********9012')).toBeInTheDocument();
    });

    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toContain('John Doe');
    expect(rendered).not.toContain('123456789012');
  });

  it('shows the tampered warning', async () => {
    (getPublicVerification as any).mockResolvedValue({
      ...mockVerified,
      hashStatus: 'tampered'
    });

    render(<PublicVerificationPage token="tok-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Integrity compromised/i)).toBeInTheDocument();
    });
  });

  it('shows the unavailable state', async () => {
    (getPublicVerification as any).mockResolvedValue({
      ...mockVerified,
      hashStatus: 'unavailable'
    });

    render(<PublicVerificationPage token="tok-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Integrity unavailable/i)).toBeInTheDocument();
    });
  });

  it('shows the invalid-link state on API failure', async () => {
    (getPublicVerification as any).mockRejectedValue(new Error('Invalid verification link'));

    render(<PublicVerificationPage token="bad-token" />);

    await waitFor(() => {
      expect(screen.getByText(/invalid or no longer available/i)).toBeInTheDocument();
    });
  });

  it('renders without any portal authentication chrome', () => {
    (getPublicVerification as any).mockResolvedValue(mockVerified);

    render(<PublicVerificationPage token="tok-123" />);

    expect(screen.queryByText(/Sign in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dashboard/i)).not.toBeInTheDocument();
  });
});
