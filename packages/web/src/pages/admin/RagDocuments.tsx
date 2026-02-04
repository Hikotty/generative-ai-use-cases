/**
 * RAG Documents Management Page Component
 *
 * Displays a list of RAG documents with search functionality, sync job status,
 * and document upload functionality.
 *
 * Requirements:
 * - 20.1: Check sync job status on page access using ListIngestionJobs API
 * - 20.2: Show warning message and disable buttons when sync is IN_PROGRESS
 * - 20.3: Enable buttons when sync is complete or not running
 * - 20.4: Display document list from Knowledge Base data source
 * - 20.5: Show file name, size, upload date, status for each document
 * - 20.6: Support file formats: PDF, TXT, MD, DOCX, HTML, CSV, XLS, XLSX
 * - 20.7: Max file size 10MB per file
 * - 20.8: Validate file format before upload
 * - 20.9: Validate file size before upload
 * - 20.10: Show upload progress
 * - 20.11: Upload to S3 using presigned URL
 * - 20.12: Start sync job after upload completes
 * - 20.13: Poll sync job status periodically
 * - 20.14: Update status when sync job completes
 * - 20.19: Support drag & drop file selection
 * - 20.20: Support multiple file upload (max 10 files)
 * - 20.21: Search functionality to filter documents by file name
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Badge,
  TextInput,
  Card,
  Callout,
  Button,
  ProgressBar,
} from '@tremor/react';
import {
  PiMagnifyingGlass,
  PiFile,
  PiFilePdf,
  PiFileDoc,
  PiFileText,
  PiFileCsv,
  PiFileImage,
  PiFileXls,
  PiFileHtml,
  PiWarning,
  PiArrowClockwise,
  PiUploadSimple,
  PiX,
  PiCheckCircle,
  PiTrash,
  PiDownloadSimple,
  PiEye,
  PiClockCounterClockwise,
  PiCaretDown,
  PiCaretUp,
} from 'react-icons/pi';
import useAdminApi, { DocumentEntry, SyncJobStatus, SyncJobHistoryEntry } from '../../hooks/useAdminApi';
import { useDebounce } from 'use-debounce';

// ============================================================================
// Constants
// ============================================================================

// Polling interval for sync status check (5 seconds)
const SYNC_STATUS_POLLING_INTERVAL = 5000;

// Maximum number of files that can be uploaded at once (Requirement 20.20)
const MAX_FILES = 10;

// Maximum file size in bytes (10MB) (Requirement 20.7)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Supported file formats (Requirement 20.6)
const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.doc',
  '.docx',
  '.html',
  '.csv',
  '.xls',
  '.xlsx',
];

// MIME type mapping for supported formats
const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.html': 'text/html',
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// File extensions that support preview (Requirement 20.22)
const PREVIEWABLE_EXTENSIONS = ['.txt', '.md'];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get file extension from filename
 */
const getFileExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
};

/**
 * Validate file format (Requirement 20.8)
 */
const isValidFormat = (fileName: string): boolean => {
  const ext = getFileExtension(fileName);
  return SUPPORTED_EXTENSIONS.includes(ext);
};

/**
 * Validate file size (Requirement 20.9)
 */
const isValidSize = (size: number): boolean => {
  return size <= MAX_FILE_SIZE;
};

/**
 * Check if file is previewable (Requirement 20.22)
 * Only .txt and .md files support preview
 */
const isPreviewable = (fileName: string): boolean => {
  const ext = getFileExtension(fileName);
  return PREVIEWABLE_EXTENSIONS.includes(ext);
};

/**
 * Get file icon based on file extension
 */
const getFileIcon = (extension: string): React.ReactNode => {
  const ext = extension.toLowerCase().replace('.', '');
  switch (ext) {
    case 'pdf':
      return <PiFilePdf className="h-5 w-5 text-red-500" />;
    case 'doc':
    case 'docx':
      return <PiFileDoc className="h-5 w-5 text-blue-500" />;
    case 'txt':
    case 'md':
      return <PiFileText className="h-5 w-5 text-gray-500" />;
    case 'csv':
      return <PiFileCsv className="h-5 w-5 text-green-500" />;
    case 'xls':
    case 'xlsx':
      return <PiFileXls className="h-5 w-5 text-green-600" />;
    case 'html':
      return <PiFileHtml className="h-5 w-5 text-orange-500" />;
    case 'jpeg':
    case 'jpg':
    case 'png':
      return <PiFileImage className="h-5 w-5 text-purple-500" />;
    default:
      return <PiFile className="h-5 w-5 text-gray-400" />;
  }
};

/**
 * Format file size to human-readable string
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Format date to locale string
 */
const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

/**
 * Get sync status badge color based on status
 */
const getSyncStatusBadgeColor = (
  status: string | undefined
): 'yellow' | 'green' | 'red' | 'gray' => {
  switch (status) {
    case 'IN_PROGRESS':
    case 'STARTING':
      return 'yellow';
    case 'COMPLETE':
      return 'green';
    case 'FAILED':
      return 'red';
    default:
      return 'gray';
  }
};

// ============================================================================
// Types
// ============================================================================

interface SelectedFile {
  file: File;
  id: string;
  error?: string;
}

interface UploadProgress {
  total: number;
  completed: number;
  current: string;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * SyncStatusBanner component displays the current sync job status
 * Requirements: 20.1, 20.2, 20.13, 20.14
 */
interface SyncStatusBannerProps {
  syncStatus: SyncJobStatus | undefined;
  isLoading: boolean;
}

const SyncStatusBanner: React.FC<SyncStatusBannerProps> = ({
  syncStatus,
  isLoading,
}) => {
  const { t } = useTranslation();

  // Don't show banner if loading or no sync status
  if (isLoading || !syncStatus) {
    return null;
  }

  // Show warning banner when sync is in progress
  if (syncStatus.syncInProgress) {
    return (
      <Callout
        title={t('admin.rag.sync.in_progress_title')}
        icon={PiWarning}
        color="yellow"
        className="mb-4"
      >
        <div className="flex items-center gap-2">
          <PiArrowClockwise className="h-4 w-4 animate-spin" />
          <span>{t('admin.rag.sync.in_progress_message')}</span>
        </div>
        {syncStatus.startedAt && (
          <div className="mt-2 text-sm text-gray-600">
            {t('admin.rag.sync.started_at', {
              time: formatDate(syncStatus.startedAt),
            })}
          </div>
        )}
      </Callout>
    );
  }

  // Show success banner when sync completed recently
  if (syncStatus.status === 'COMPLETE' && syncStatus.completedAt) {
    const completedTime = new Date(syncStatus.completedAt).getTime();
    const now = Date.now();
    // Show success message for 30 seconds after completion
    if (now - completedTime < 30000) {
      return (
        <Callout
          title={t('admin.rag.sync.complete_title')}
          color="green"
          className="mb-4"
        >
          <span>
            {t('admin.rag.sync.complete_message', {
              count: syncStatus.documentsProcessed ?? 0,
            })}
          </span>
          {syncStatus.completedAt && (
            <div className="mt-1 text-sm text-gray-600">
              {t('admin.rag.sync.completed_at', {
                time: formatDate(syncStatus.completedAt),
              })}
            </div>
          )}
        </Callout>
      );
    }
  }

  // Show error banner when sync failed
  if (syncStatus.status === 'FAILED') {
    return (
      <Callout
        title={t('admin.rag.sync.failed_title')}
        color="red"
        className="mb-4"
      >
        <span>{t('admin.rag.sync.failed_message')}</span>
        {syncStatus.failureReasons && syncStatus.failureReasons.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-sm">
            {syncStatus.failureReasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        )}
      </Callout>
    );
  }

  return null;
};

/**
 * SyncStatusBadge component displays a compact status badge
 */
interface SyncStatusBadgeProps {
  syncStatus: SyncJobStatus | undefined;
  isLoading: boolean;
}

const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  syncStatus,
  isLoading,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Badge color="gray" className="animate-pulse">
        {t('admin.rag.sync.checking')}
      </Badge>
    );
  }

  if (!syncStatus) {
    return null;
  }

  const statusKey = syncStatus.syncInProgress
    ? 'in_progress'
    : syncStatus.status?.toLowerCase() ?? 'idle';

  return (
    <Badge
      color={getSyncStatusBadgeColor(
        syncStatus.syncInProgress ? 'IN_PROGRESS' : syncStatus.status
      )}
      className="flex items-center gap-1"
    >
      {syncStatus.syncInProgress && (
        <PiArrowClockwise className="h-3 w-3 animate-spin" />
      )}
      {t(`admin.rag.sync.status.${statusKey}`, {
        defaultValue: syncStatus.status ?? t('admin.rag.sync.status.idle'),
      })}
    </Badge>
  );
};

/**
 * DocumentTable component displays documents in a Tremor Table
 * Requirements: 20.2, 20.3 - Buttons disabled when sync is in progress
 * Requirements: 20.16, 20.17 - Delete and download functionality
 * Requirements: 20.22 - Preview text files (.txt, .md)
 */
interface DocumentTableProps {
  documents: DocumentEntry[];
  isLoading: boolean;
  isSyncInProgress: boolean;
  onDelete: (document: DocumentEntry) => void;
  onDownload: (document: DocumentEntry) => void;
  onPreview: (document: DocumentEntry) => void;
}

const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  isLoading,
  isSyncInProgress,
  onDelete,
  onDownload,
  onPreview,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        {t('admin.rag.no_documents_found')}
      </div>
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{t('admin.rag.table.file_name')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.rag.table.size')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.rag.table.uploaded_at')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.rag.table.status')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.rag.table.actions')}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {documents.map((doc) => {
          const canPreview = isPreviewable(doc.fileName);
          return (
            <TableRow key={doc.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {getFileIcon(doc.extension)}
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">{doc.fileName}</span>
                    <span className="text-xs text-gray-500">{doc.extension}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-gray-600">
                {formatFileSize(doc.size)}
              </TableCell>
              <TableCell className="text-gray-500">
                {formatDate(doc.uploadedAt)}
              </TableCell>
              <TableCell>
                <Badge color="green">{t('admin.rag.status.available')}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {canPreview && (
                    <button
                      type="button"
                      onClick={() => onPreview(doc)}
                      disabled={isSyncInProgress}
                      className="rounded p-1.5 text-gray-600 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                      title={t('admin.rag.actions.preview')}
                    >
                      <PiEye className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDownload(doc)}
                    disabled={isSyncInProgress}
                    className="rounded p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                    title={t('admin.rag.actions.download')}
                  >
                    <PiDownloadSimple className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(doc)}
                    disabled={isSyncInProgress}
                    className="rounded p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                    title={t('admin.rag.actions.delete')}
                  >
                    <PiTrash className="h-4 w-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

/**
 * FileUploadArea component for drag & drop file selection
 * Requirements: 20.6, 20.7, 20.8, 20.9, 20.19, 20.20
 */
interface FileUploadAreaProps {
  selectedFiles: SelectedFile[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  disabled: boolean;
}

const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  selectedFiles,
  onFilesSelected,
  onRemoveFile,
  disabled,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [disabled, onFilesSelected]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFilesSelected]);

  // Handle click on drop zone
  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  // Generate accept attribute for file input
  const acceptAttribute = SUPPORTED_EXTENSIONS.join(',');

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`
          relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors
          ${isDragOver ? 'border-aws-smile bg-aws-smile/5' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptAttribute}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />
        <PiUploadSimple className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm font-medium text-gray-700">
          {t('admin.rag.upload.drag_drop_hint')}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {t('admin.rag.upload.formats_hint')}
        </p>
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">
            {t('admin.rag.upload.file_count', { count: selectedFiles.length })}
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {selectedFiles.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  item.error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {getFileIcon(getFileExtension(item.file.name))}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">
                      {item.file.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatFileSize(item.file.size)}
                    </span>
                    {item.error && (
                      <span className="text-xs text-red-600">{item.error}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(item.id);
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  title={t('admin.rag.upload.remove_file')}
                  disabled={disabled}
                >
                  <PiX className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * UploadDialog component for document upload modal
 * Requirements: 20.6, 20.7, 20.8, 20.9, 20.10, 20.11, 20.12, 20.19, 20.20
 */
interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
  adminApi: ReturnType<typeof useAdminApi>;
}

const UploadDialog: React.FC<UploadDialogProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
  adminApi,
}) => {
  const { t } = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedFiles([]);
      setIsUploading(false);
      setUploadProgress(null);
      setUploadError(null);
      setUploadSuccess(false);
    }
  }, [isOpen]);

  // Handle files selected from drop zone or file input
  const handleFilesSelected = useCallback((files: File[]) => {
    const currentCount = selectedFiles.length;
    const remainingSlots = MAX_FILES - currentCount;

    if (files.length > remainingSlots) {
      setUploadError(t('admin.rag.upload.error.file_count_exceeded', { max: MAX_FILES }));
      return;
    }

    const newFiles: SelectedFile[] = files.map((file) => {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      let error: string | undefined;

      // Validate format (Requirement 20.8)
      if (!isValidFormat(file.name)) {
        error = t('admin.rag.upload.error.invalid_format', { fileName: file.name });
      }
      // Validate size (Requirement 20.9)
      else if (!isValidSize(file.size)) {
        error = t('admin.rag.upload.error.file_size_exceeded', { maxSize: MAX_FILE_SIZE / (1024 * 1024) });
      }

      return { file, id, error };
    });

    setSelectedFiles((prev) => [...prev, ...newFiles]);
    setUploadError(null);
  }, [selectedFiles.length, t]);

  // Handle remove file from selection
  const handleRemoveFile = useCallback((id: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Handle clear all files
  const handleClearFiles = useCallback(() => {
    setSelectedFiles([]);
    setUploadError(null);
  }, []);

  // Handle upload (Requirements: 20.10, 20.11, 20.12)
  const handleUpload = useCallback(async () => {
    // Filter out files with errors
    const validFiles = selectedFiles.filter((f) => !f.error);
    if (validFiles.length === 0) {
      setUploadError(t('admin.rag.upload.error.invalid_format', { fileName: '' }));
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress({ total: validFiles.length, completed: 0, current: '' });

    try {
      // Upload each file sequentially
      for (let i = 0; i < validFiles.length; i++) {
        const { file } = validFiles[i];
        setUploadProgress({
          total: validFiles.length,
          completed: i,
          current: file.name,
        });

        // Get presigned URL from backend
        const ext = getFileExtension(file.name);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        const uploadResponse = await adminApi.uploadDocument({
          fileName: file.name,
          fileSize: file.size,
          contentType,
        });

        // Upload file to S3 using presigned URL (Requirement 20.11)
        const uploadResult = await fetch(uploadResponse.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': contentType,
          },
        });

        if (!uploadResult.ok) {
          throw new Error(t('admin.rag.upload.error.upload_failed', { fileName: file.name }));
        }
      }

      // Complete upload and start sync job (Requirement 20.12)
      setUploadProgress({
        total: validFiles.length,
        completed: validFiles.length,
        current: '',
      });

      await adminApi.completeUpload();

      setUploadSuccess(true);
      setIsUploading(false);

      // Notify parent to refresh data
      setTimeout(() => {
        onUploadComplete();
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(
        error instanceof Error
          ? error.message
          : t('admin.rag.upload.error.upload_failed', { fileName: '' })
      );
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [selectedFiles, adminApi, t, onUploadComplete, onClose]);

  // Check if upload button should be disabled
  const hasValidFiles = selectedFiles.some((f) => !f.error);
  const canUpload = hasValidFiles && !isUploading;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('admin.rag.upload.title')}
          </h2>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <PiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {uploadSuccess ? (
            // Success state
            <div className="py-8 text-center">
              <PiCheckCircle className="mx-auto h-16 w-16 text-green-500" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                {t('admin.rag.upload.success_title')}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {t('admin.rag.upload.success_message', {
                  count: selectedFiles.filter((f) => !f.error).length,
                })}
              </p>
            </div>
          ) : (
            <>
              {/* File Upload Area */}
              <FileUploadArea
                selectedFiles={selectedFiles}
                onFilesSelected={handleFilesSelected}
                onRemoveFile={handleRemoveFile}
                disabled={isUploading}
              />

              {/* Upload Progress (Requirement 20.10) */}
              {uploadProgress && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {t('admin.rag.upload.uploading')}
                    </span>
                    <span className="text-gray-500">
                      {uploadProgress.completed}/{uploadProgress.total}
                    </span>
                  </div>
                  <ProgressBar
                    value={(uploadProgress.completed / uploadProgress.total) * 100}
                    color="blue"
                  />
                  {uploadProgress.current && (
                    <p className="text-xs text-gray-500 truncate">
                      {uploadProgress.current}
                    </p>
                  )}
                </div>
              )}

              {/* Error Message */}
              {uploadError && (
                <Callout
                  title={uploadError}
                  color="red"
                  className="mt-4"
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!uploadSuccess && (
          <div className="flex items-center justify-between border-t px-6 py-4">
            <Button
              variant="secondary"
              onClick={handleClearFiles}
              disabled={isUploading || selectedFiles.length === 0}
            >
              {t('admin.rag.upload.clear')}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isUploading}
              >
                {t('admin.rag.upload.cancel')}
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!canUpload}
                loading={isUploading}
              >
                {isUploading
                  ? t('admin.rag.upload.uploading')
                  : t('admin.rag.upload.start_upload')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * DeleteConfirmDialog component for document deletion confirmation
 * Requirements: 20.16 - Delete document with confirmation dialog
 */
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  document: DocumentEntry | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  isOpen,
  document,
  onClose,
  onConfirm,
  isDeleting,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('admin.rag.delete.title')}
          </h2>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <PiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              <PiTrash className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-gray-700">
                {t('admin.rag.delete.message')}
              </p>
              <p className="mt-2 font-medium text-gray-900">
                {document.fileName}
              </p>
              <p className="mt-3 text-sm text-gray-500">
                {t('admin.rag.delete.warning')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            {t('admin.rag.delete.cancel')}
          </Button>
          <Button
            color="red"
            onClick={onConfirm}
            loading={isDeleting}
          >
            {isDeleting
              ? t('admin.rag.delete.deleting')
              : t('admin.rag.delete.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * PreviewDialog component for document content preview
 * Requirements: 20.22 - Preview text files (.txt, .md) - display content in a modal
 */
interface PreviewDialogProps {
  isOpen: boolean;
  document: DocumentEntry | null;
  onClose: () => void;
  adminApi: ReturnType<typeof useAdminApi>;
}

const PreviewDialog: React.FC<PreviewDialogProps> = ({
  isOpen,
  document,
  onClose,
  adminApi,
}) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch document content when dialog opens
  useEffect(() => {
    if (!isOpen || !document) {
      setContent('');
      setError(null);
      return;
    }

    const fetchContent = async () => {
      setIsLoading(true);
      setError(null);
      setContent('');

      try {
        // Get presigned URL for the document
        const response = await adminApi.downloadDocument(document.id);
        
        // Fetch the content from the presigned URL
        const contentResponse = await fetch(response.downloadUrl);
        
        if (!contentResponse.ok) {
          throw new Error(t('admin.rag.preview.error.fetch_failed'));
        }

        const text = await contentResponse.text();
        setContent(text);
      } catch (err) {
        console.error('Preview error:', err);
        setError(
          err instanceof Error
            ? err.message
            : t('admin.rag.preview.error.fetch_failed')
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [isOpen, document, adminApi, t]);

  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            {getFileIcon(document.extension)}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {t('admin.rag.preview.title')}
              </h2>
              <p className="text-sm text-gray-500">{document.fileName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <PiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
                <span className="text-sm text-gray-500">
                  {t('admin.rag.preview.loading')}
                </span>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <Callout title={t('admin.rag.preview.error.title')} color="red">
                {error}
              </Callout>
            </div>
          ) : (
            <div className="h-full overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-sm text-gray-800">
                {content}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 justify-end border-t px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            {t('admin.rag.preview.close')}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * SyncJobHistory component displays sync job history in a collapsible section
 * Requirements: 20.24 - Display sync job history with start time, completion time,
 * processed file count, success/failure count
 */
interface SyncJobHistoryProps {
  adminApi: ReturnType<typeof useAdminApi>;
}

const SyncJobHistory: React.FC<SyncJobHistoryProps> = ({ adminApi }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch sync job history
  const { data, isLoading, error } = adminApi.getSyncHistory(
    { limit: 10 },
    {
      revalidateOnFocus: false,
      // Only fetch when expanded
      isPaused: () => !isExpanded,
    }
  );

  // Toggle expanded state
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Get status badge color
  const getStatusBadgeColor = (
    status: string
  ): 'yellow' | 'green' | 'red' | 'gray' => {
    switch (status) {
      case 'IN_PROGRESS':
      case 'STARTING':
        return 'yellow';
      case 'COMPLETE':
        return 'green';
      case 'FAILED':
        return 'red';
      default:
        return 'gray';
    }
  };

  // Format duration between start and end time
  const formatDuration = (startedAt: string, completedAt?: string): string => {
    if (!completedAt) {
      return '-';
    }
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = end - start;

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }
    if (durationMs < 60000) {
      return `${Math.round(durationMs / 1000)}s`;
    }
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.round((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <Card>
      {/* Header - Clickable to expand/collapse */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <PiClockCounterClockwise className="h-5 w-5 text-gray-500" />
          <h3 className="font-medium text-gray-900">
            {t('admin.rag.history.title')}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-sm text-gray-500">
              {t('admin.rag.history.job_count', { count: data.count })}
            </span>
          )}
          {isExpanded ? (
            <PiCaretUp className="h-5 w-5 text-gray-400" />
          ) : (
            <PiCaretDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-4 text-center text-red-600">
              {t('admin.rag.history.error_loading')}
            </div>
          ) : !data || data.jobs.length === 0 ? (
            <div className="py-4 text-center text-gray-500">
              {t('admin.rag.history.no_jobs')}
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t('admin.rag.history.table.job_id')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin.rag.history.table.status')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin.rag.history.table.started_at')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin.rag.history.table.completed_at')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin.rag.history.table.duration')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin.rag.history.table.processed')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin.rag.history.table.failed')}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.jobs.map((job: SyncJobHistoryEntry) => (
                  <TableRow key={job.jobId}>
                    <TableCell>
                      <span className="font-mono text-xs text-gray-600">
                        {job.jobId.slice(0, 8)}...
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge color={getStatusBadgeColor(job.status)}>
                        {job.status === 'IN_PROGRESS' && (
                          <PiArrowClockwise className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        {t(`admin.rag.sync.status.${job.status.toLowerCase()}`, {
                          defaultValue: job.status,
                        })}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {formatDate(job.startedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {job.completedAt ? formatDate(job.completedAt) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {formatDuration(job.startedAt, job.completedAt)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-green-600">
                        {job.documentsProcessed ?? '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-medium ${
                          (job.documentsFailed ?? 0) > 0
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {job.documentsFailed ?? '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </Card>
  );
};

// ============================================================================
// Main Component
// ============================================================================

/**
 * Main RagDocuments page component
 */
const RagDocuments: React.FC = () => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  // Upload dialog state
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Preview dialog state (Requirement 20.22)
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [documentToPreview, setDocumentToPreview] = useState<DocumentEntry | null>(null);

  // Fetch sync status with SWR and polling
  // Requirements: 20.1, 20.13 - Check sync status on page access and poll periodically
  const {
    data: syncStatusData,
    isLoading: isSyncStatusLoading,
    mutate: mutateSyncStatus,
  } = adminApi.getSyncStatus({
    refreshInterval: SYNC_STATUS_POLLING_INTERVAL,
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });

  // Determine if sync is in progress
  // Requirements: 20.2, 20.3 - Disable buttons when sync is IN_PROGRESS
  const isSyncInProgress = useMemo(() => {
    return syncStatusData?.syncInProgress ?? false;
  }, [syncStatusData?.syncInProgress]);

  // Fetch documents with SWR
  const { data, error, isLoading, mutate: mutateDocuments } = adminApi.listDocuments(
    {
      search: debouncedSearch || undefined,
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  // Refresh documents when sync completes
  // Requirements: 20.14 - Update status when sync job completes
  useEffect(() => {
    if (syncStatusData && !syncStatusData.syncInProgress && syncStatusData.status === 'COMPLETE') {
      // Refresh document list when sync completes
      mutateDocuments();
    }
  }, [syncStatusData?.syncInProgress, syncStatusData?.status, mutateDocuments]);

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  // Manual refresh of sync status
  const handleRefreshSyncStatus = useCallback(() => {
    mutateSyncStatus();
  }, [mutateSyncStatus]);

  // Handle upload dialog open
  const handleOpenUploadDialog = useCallback(() => {
    setIsUploadDialogOpen(true);
  }, []);

  // Handle upload dialog close
  const handleCloseUploadDialog = useCallback(() => {
    setIsUploadDialogOpen(false);
  }, []);

  // Handle upload complete - refresh data
  const handleUploadComplete = useCallback(() => {
    mutateSyncStatus();
    mutateDocuments();
  }, [mutateSyncStatus, mutateDocuments]);

  // Handle delete button click - open confirmation dialog
  // Requirement 20.16: Delete document with confirmation dialog
  const handleDeleteClick = useCallback((document: DocumentEntry) => {
    setDocumentToDelete(document);
    setIsDeleteDialogOpen(true);
  }, []);

  // Handle delete dialog close
  const handleCloseDeleteDialog = useCallback(() => {
    setIsDeleteDialogOpen(false);
    setDocumentToDelete(null);
  }, []);

  // Handle delete confirmation
  // Requirement 20.16: Delete document from S3 and trigger re-sync
  const handleConfirmDelete = useCallback(async () => {
    if (!documentToDelete) return;

    setIsDeleting(true);
    try {
      await adminApi.deleteDocument(documentToDelete.id);
      // Refresh data after successful deletion
      mutateSyncStatus();
      mutateDocuments();
      handleCloseDeleteDialog();
    } catch (error) {
      console.error('Delete error:', error);
      // Keep dialog open on error so user can see the issue
    } finally {
      setIsDeleting(false);
    }
  }, [documentToDelete, adminApi, mutateSyncStatus, mutateDocuments, handleCloseDeleteDialog]);

  // Handle download button click
  // Requirement 20.17: Download document using presigned URL
  const handleDownload = useCallback(async (document: DocumentEntry) => {
    try {
      const response = await adminApi.downloadDocument(document.id);
      // Open the presigned URL in a new tab to trigger download
      window.open(response.downloadUrl, '_blank');
    } catch (error) {
      console.error('Download error:', error);
    }
  }, [adminApi]);

  // Handle preview button click - open preview dialog
  // Requirement 20.22: Preview text files (.txt, .md)
  const handlePreviewClick = useCallback((document: DocumentEntry) => {
    setDocumentToPreview(document);
    setIsPreviewDialogOpen(true);
  }, []);

  // Handle preview dialog close
  const handleClosePreviewDialog = useCallback(() => {
    setIsPreviewDialogOpen(false);
    setDocumentToPreview(null);
  }, []);

  // Get documents from response
  const documents = useMemo(() => data?.documents ?? [], [data?.documents]);

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.rag.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('admin.rag.description')}
          </p>
        </div>

        {/* Error Message */}
        <Card>
          <div className="py-12 text-center">
            <p className="text-red-600">{t('admin.rag.error_loading')}</p>
            <p className="mt-2 text-sm text-gray-500">
              {adminApi.getErrorMessage(error)}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.rag.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('admin.rag.description')}
          </p>
        </div>
        {/* Sync Status Badge */}
        <div className="flex items-center gap-2">
          <SyncStatusBadge
            syncStatus={syncStatusData}
            isLoading={isSyncStatusLoading}
          />
          <button
            onClick={handleRefreshSyncStatus}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title={t('admin.rag.sync.refresh')}
          >
            <PiArrowClockwise
              className={`h-4 w-4 ${isSyncStatusLoading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      <SyncStatusBanner
        syncStatus={syncStatusData}
        isLoading={isSyncStatusLoading}
      />

      {/* Search and Upload Button */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Input */}
          <div className="w-full sm:max-w-md">
            <TextInput
              icon={PiMagnifyingGlass}
              placeholder={t('admin.rag.search_placeholder')}
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>

          {/* Upload Button and Document Count */}
          <div className="flex items-center gap-4">
            {data && (
              <div className="text-sm text-gray-500">
                {t('admin.rag.document_count', { count: data.count })}
              </div>
            )}
            <Button
              icon={PiUploadSimple}
              onClick={handleOpenUploadDialog}
              disabled={isSyncInProgress}
            >
              {t('admin.rag.upload.button')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Documents Table */}
      <Card>
        <DocumentTable
          documents={documents}
          isLoading={isLoading}
          isSyncInProgress={isSyncInProgress}
          onDelete={handleDeleteClick}
          onDownload={handleDownload}
          onPreview={handlePreviewClick}
        />
      </Card>

      {/* Sync Job History (Requirement 20.24) */}
      <SyncJobHistory adminApi={adminApi} />

      {/* Upload Dialog */}
      <UploadDialog
        isOpen={isUploadDialogOpen}
        onClose={handleCloseUploadDialog}
        onUploadComplete={handleUploadComplete}
        adminApi={adminApi}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        document={documentToDelete}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* Preview Dialog (Requirement 20.22) */}
      <PreviewDialog
        isOpen={isPreviewDialogOpen}
        document={documentToPreview}
        onClose={handleClosePreviewDialog}
        adminApi={adminApi}
      />
    </div>
  );
};

export default RagDocuments;
