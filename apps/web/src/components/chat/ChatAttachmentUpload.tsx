import React, { useRef, useState } from 'react';
import { Paperclip, X, AlertCircle } from 'lucide-react';
import { uploadChatFiles } from '../../services/api';

interface UploadedFile {
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  storageUrl: string;
}

interface Props {
  onFilesSelected: (files: UploadedFile[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export function ChatAttachmentUpload({ onFilesSelected, disabled, maxFiles = 5 }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;
    
    if (files.length + selectedFiles.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const uploadedFiles = await uploadChatFiles(files);
      const newFiles = [...selectedFiles, ...uploadedFiles.files];
      setSelectedFiles(newFiles);
      onFilesSelected(newFiles);
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to upload files';
      setError(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const getFileIcon = (fileType: string): string => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('sheet')) return '📊';
    if (fileType.includes('presentation')) return '📽️';
    if (fileType === 'text/plain') return '📃';
    return '📎';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || uploading || selectedFiles.length >= maxFiles}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title={selectedFiles.length >= maxFiles ? `Maximum ${maxFiles} files allowed` : 'Upload files'}
      >
        <Paperclip size={16} />
        {uploading ? 'Uploading...' : 'Add files'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        disabled={disabled || uploading}
        className="hidden"
        accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
      />

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <p className="text-xs font-medium text-slate-600">Attachments ({selectedFiles.length})</p>
          <div className="space-y-1">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.fileName}-${index}`}
                className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-slate-200 group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-lg flex-shrink-0">{getFileIcon(file.fileType)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 truncate">{file.fileName}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(file.fileSize)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="p-1 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
