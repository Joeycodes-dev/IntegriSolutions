import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EvidenceReview } from '../../src/components/supervisor/EvidenceReview';
import * as api from '../../src/services/api';

const mockTest = {
  id: 'test-123',
  officerId: 1,
  officerName: 'John Doe',
  badgeNumber: '12345',
  driverName: 'Jane Smith',
  driverId: '9876543210123',
  driverDob: '1990-01-01',
  bacReading: 0.08,
  result: 'fail' as const,
  createdAt: '2026-05-30T10:00:00Z',
  location: JSON.stringify({ lat: -26.2041, lng: 28.0473 }),
  hash: 'abc123',
  hashValid: true
};

const mockAnnotation = {
  id: 1,
  test_id: 'test-123',
  supervisor_email: 'supervisor@example.com',
  comment: 'Verified and approved',
  status: 'verified' as const,
  created_at: '2026-05-30T12:00:00Z',
  case_status: 'verified' as const
};

vi.mock('../../src/services/api', () => ({
  getAnnotations: vi.fn(),
  annotateTest: vi.fn(),
  getEvidence: vi.fn(),
  getRuntimeConfig: vi.fn().mockResolvedValue({
    auth: { sessionTimeoutMinutes: 30 },
    export: {
      pdfWatermarkEnabled: true,
      pdfWatermarkText: 'IntegriScan Court Evidence',
      pdfAccess: 'admin_supervisor'
    },
    alerts: {
      integrityFlagCount: 1,
      failureRateChangePoints: 1,
      roadblockMinimumTests: 3,
      avgFailingBacMultiple: 2
    },
    bacLimits: [
      { key: 'general', label: 'General Driver', limitG100ml: 0.05, limitMg1000ml: 0.24 },
      { key: 'professional', label: 'Professional Driver', limitG100ml: 0.02, limitMg1000ml: 0.1 }
    ]
  })
}));

describe('EvidenceReview', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getAnnotations as any).mockResolvedValue([]);
    (api.getEvidence as any).mockResolvedValue([]);
  });

  it('renders mobile court fields from location JSON', async () => {
    const testWithCourtFields = {
      ...mockTest,
      location: JSON.stringify({
        lat: -26.2041,
        lng: 28.0473,
        roadblock: 'N1 Midrand roadblock',
        station: 'Midrand SAPS',
        officerRank: 'Constable',
        officerNotes: 'Driver smelled of alcohol.'
      })
    };

    render(<EvidenceReview test={testWithCourtFields} onBack={mockOnBack} />);

    expect(screen.getAllByText('N1 Midrand roadblock').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Midrand SAPS')).toBeInTheDocument();
    expect(screen.getByText('Driver smelled of alcohol.')).toBeInTheDocument();
  });

  it('shows empty photo state instead of stock placeholders', async () => {
    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    await waitFor(() => {
      expect(screen.getByText(/No evidence photos uploaded yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByAltText('Evidence 1')).not.toBeInTheDocument();
  });

  it('renders test details correctly', async () => {
    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    expect(screen.getByText('Evidence Review')).toBeInTheDocument();
    expect(screen.getByText(/ARW-TEST123-T123/)).toBeInTheDocument();
    expect(screen.getByText('Driver & Incident Details')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('9876543210123')).toBeInTheDocument();
  });

  it('shows hash verification banner for valid hash', async () => {
    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Record integrity verified/i)).toBeInTheDocument();
    });
  });

  it('shows tamper warning for invalid hash', async () => {
    const tamperedTest = { ...mockTest, hashValid: false };
    render(<EvidenceReview test={tamperedTest} onBack={mockOnBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Tampering detected/i)).toBeInTheDocument();
    });
  });

  it('loads and displays annotations', async () => {
    (api.getAnnotations as any).mockResolvedValue([mockAnnotation]);

    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    await waitFor(() => {
      expect(screen.getByText('Annotation History')).toBeInTheDocument();
      expect(screen.getByText('Verified and approved')).toBeInTheDocument();
      expect(screen.getByText(/supervisor@example.com/)).toBeInTheDocument();
    });
  });

  it('allows supervisor to add annotation', async () => {
    (api.annotateTest as any).mockResolvedValue(mockAnnotation);

    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    const commentInput = screen.getByPlaceholderText(/Add a comment/i);
    fireEvent.change(commentInput, { target: { value: 'Test comment' } });

    const approveButton = screen.getByRole('button', { name: /Verify and Archive/i });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.annotateTest).toHaveBeenCalledWith('test-123', {
        comment: 'Test comment',
        status: 'verified'
      });
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });
  });

  it('allows supervisor to refer test for investigation', async () => {
    (api.annotateTest as any).mockResolvedValue({
      ...mockAnnotation,
      status: 'referred',
      case_status: 'referred'
    });

    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    const commentInput = screen.getByPlaceholderText(/Add a comment/i);
    fireEvent.change(commentInput, { target: { value: 'Needs further review' } });

    const referButton = screen.getByRole('button', { name: /Flag for Investigation/i });
    fireEvent.click(referButton);

    await waitFor(() => {
      expect(api.annotateTest).toHaveBeenCalledWith('test-123', {
        comment: 'Needs further review',
        status: 'referred'
      });
      expect(screen.getByText('Referred')).toBeInTheDocument();
    });
  });

  it('allows supervisor to start review on a new case', async () => {
    (api.annotateTest as any).mockResolvedValue({
      ...mockAnnotation,
      status: 'under_review',
      case_status: 'under_review'
    });

    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    const startButton = screen.getByRole('button', { name: /Start Review/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(api.annotateTest).toHaveBeenCalledWith('test-123', {
        comment: undefined,
        status: 'under_review'
      });
      expect(screen.getAllByText('Under Review').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('allows supervisor to mark a case invalid and close it', async () => {
    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    fireEvent.click(screen.getByRole('button', { name: /Mark Invalid/i }));
    await waitFor(() => {
      expect(api.annotateTest).toHaveBeenCalledWith('test-123', {
        comment: undefined,
        status: 'invalidated'
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /Close Case/i }));
    await waitFor(() => {
      expect(api.annotateTest).toHaveBeenCalledWith('test-123', {
        comment: undefined,
        status: 'closed'
      });
    });
  });

  it('calls onBack when back button is clicked', () => {
    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    const backButton = screen.getByRole('button', { name: /Back to logs/i });
    fireEvent.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('disables annotation buttons while submitting', async () => {
    (api.annotateTest as any).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockAnnotation), 100)));

    render(<EvidenceReview test={mockTest} onBack={mockOnBack} />);

    const approveButton = screen.getByRole('button', { name: /Verify and Archive/i });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(approveButton).toBeDisabled();
    });
  });
});
