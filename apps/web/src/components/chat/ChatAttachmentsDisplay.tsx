import React, { useEffect } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { markAttachmentOpened } from '../../services/api';
import type { ChatAttachment } from '../../types';

interface Props {
  attachments: ChatAttachment[];
  onAttachmentOpen?: (attachmentId: number) => void;
}

export function ChatAttachmentsDisplay({ attachments, onAttachmentOpen }: Props) {
  const getFileIcon = (fileType: string): React.ReactNode => {
    if (fileType.startsWith('image/')) {
      return '🖼️';
    }
    if (fileType === 'application/pdf') return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('sheet')) return '📊';
    if (fileType.includes('presentation')) return '📽️';
    if (fileType === 'text/plain') return '📃';
    return '📎';
  };

  const isImage = (fileType: string): boolean => {
    return fileType.startsWith('image/');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleAttachmentClick = async (attachment: ChatAttachment) => {
    try {
      await markAttachmentOpened(attachment.id);
      onAttachmentOpen?.(attachment.id);
      // Open file in new tab
      window.open(attachment.storageUrl, '_blank');
    } catch (err) {
      console.error('Failed to mark attachment as opened:', err);
      // Still open the file even if tracking fails
      window.open(attachment.storageUrl, '_blank');
    }
  };

  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="max-w-sm rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
        >
          {isImage(attachment.fileType) ? (
            // Image preview
            <div className="group relative">
              <img
                src={attachment.storageUrl}
                alt={attachment.fileName}
                className="w-full h-auto max-h-64 object-cover bg-slate-100 cursor-pointer"
                onClick={() => handleAttachmentClick(attachment)}
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-colors group-hover:bg-black/30 group-hover:opacity-100">
                <Eye size={32} className="text-white" />
              </div>
            </div>
          ) : (
            // File preview
            <div
              onClick={() => handleAttachmentClick(attachment)}
              className="p-3 bg-gradient-to-br from-slate-50 to-slate-100 cursor-pointer hover:from-slate-100 hover:to-slate-150 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="text-3xl flex-shrink-0 mt-1">{getFileIcon(attachment.fileType)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{attachment.fileName}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(attachment.fileSize)}</p>
                  </div>
                </div>
                <Download size={18} className="text-slate-400 flex-shrink-0 mt-1" />
              </div>
            </div>
          )}

          {/* Opened/seen indicator */}
          {attachment.openedCount > 0 && (
            <div className="px-3 py-2 bg-blue-50 border-t border-slate-200">
              <div className="flex items-center gap-2 text-xs">
                <Eye size={14} className="text-blue-600" />
                <span className="text-blue-700 font-medium">
                  {attachment.openedCount === 1
                    ? '1 person viewed'
                    : `${attachment.openedCount} people viewed`}
                </span>
              </div>
              {attachment.openedBy.length > 0 && (
                <div className="mt-2 space-y-1">
                  {attachment.openedBy.slice(0, 3).map((viewer, idx) => (
                    <div key={idx} className="text-xs text-slate-600">
                      <span className="font-medium">{viewer.name}</span>
                      {viewer.badgeNumber && <span className="text-slate-500"> ({viewer.badgeNumber})</span>}
                      <span className="text-slate-400 text-xs ml-1">
                        {new Date(viewer.openedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                  {attachment.openedBy.length > 3 && (
                    <div className="text-xs text-slate-600">+{attachment.openedBy.length - 3} more</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
