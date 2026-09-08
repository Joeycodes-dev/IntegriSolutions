import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatAttachmentsDisplay } from '../../src/components/chat/ChatAttachmentsDisplay';
import * as api from '../../src/services/api';
import type { ChatAttachment } from '../../src/types';

vi.mock('../../src/services/api', () => ({
  markAttachmentOpened: vi.fn(),
}));

function attachment(overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    id: 1,
    fileName: 'scene.jpg',
    fileType: 'image/jpeg',
    fileSize: 2048,
    storageUrl: 'https://example.com/scene.jpg',
    openedCount: 0,
    openedBy: [],
    createdAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

describe('ChatAttachmentsDisplay (new feature)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.markAttachmentOpened as any).mockResolvedValue({ ok: true });
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('renders nothing when there are no attachments', () => {
    const { container } = render(<ChatAttachmentsDisplay attachments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders image previews with file metadata', () => {
    render(<ChatAttachmentsDisplay attachments={[attachment()]} />);
    expect(screen.getByAltText('scene.jpg')).toBeInTheDocument();
  });

  it('renders file cards with icons + formatted sizes for non-images', () => {
    render(<ChatAttachmentsDisplay attachments={[attachment({ id: 2, fileName: 'report.pdf', fileType: 'application/pdf', fileSize: 2 * 1024 * 1024 })]} />);
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(screen.getByText('📄')).toBeInTheDocument();
  });

  it('shows viewed counts and the first viewers', () => {
    render(
      <ChatAttachmentsDisplay
        attachments={[
          attachment({
            openedCount: 2,
            openedBy: [
              { source: 'officer_users', participantId: 11, roleId: 1, name: 'John Doe', badgeNumber: 'B11', openedAt: '2026-09-01T10:05:00Z' },
              { source: 'supervisor_users', participantId: 7, roleId: 2, name: 'Sara Super', badgeNumber: 'S1', openedAt: '2026-09-01T10:06:00Z' },
            ],
          }),
        ]}
      />
    );
    expect(screen.getByText('2 people viewed')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Sara Super')).toBeInTheDocument();
  });

  it('marks the attachment opened then opens the file, even when tracking fails', async () => {
    (api.markAttachmentOpened as any).mockRejectedValueOnce(new Error('network'));
    render(<ChatAttachmentsDisplay attachments={[attachment({ fileType: 'application/pdf', fileName: 'doc.pdf' })]} />);

    fireEvent.click(screen.getByText('doc.pdf'));

    await vi.waitFor(() => {
      expect(api.markAttachmentOpened).toHaveBeenCalledWith(1);
      expect(window.open).toHaveBeenCalledWith('https://example.com/scene.jpg', '_blank');
    });
  });
});
