/**
 * Bulk Import Dialog Component
 *
 * Provides a dialog for bulk importing users from a CSV file.
 *
 * Requirements:
 * - 3.12: Upload CSV file for bulk user import
 * - 3.13: Display import results (success count, failure count, error details per row)
 */

import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogPanel,
  Button,
  Badge,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@tremor/react';
import {
  PiX,
  PiUploadSimple,
  PiFileText,
  PiCheckCircle,
  PiXCircle,
} from 'react-icons/pi';
import useAdminApi, { BulkRegistrationResult } from '../../hooks/useAdminApi';

/**
 * Props for BulkImportDialog component
 */
interface BulkImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Import state enum
 */
type ImportState = 'select' | 'uploading' | 'results';

/**
 * BulkImportDialog component for CSV bulk user import
 *
 * Requirements:
 * - 3.12: Upload CSV file for bulk user import
 * - 3.13: Display import results (success count, failure count, error details per row)
 */
const BulkImportDialog: React.FC<BulkImportDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [importState, setImportState] = useState<ImportState>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    totalRows: number;
    successCount: number;
    failureCount: number;
    results: BulkRegistrationResult[];
  } | null>(null);

  /**
   * Reset dialog state
   */
  const resetState = useCallback(() => {
    setImportState('select');
    setSelectedFile(null);
    setError(null);
    setResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Handle dialog close
   */
  const handleClose = useCallback(() => {
    if (importState !== 'uploading') {
      resetState();
      onClose();
    }
  }, [importState, resetState, onClose]);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        // Validate file type
        if (!file.name.endsWith('.csv')) {
          setError(t('admin.users.bulk_import.error_invalid_file_type'));
          return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          setError(t('admin.users.bulk_import.error_file_too_large'));
          return;
        }

        setSelectedFile(file);
        setError(null);
      }
    },
    [t]
  );

  /**
   * Handle file drop
   */
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const file = event.dataTransfer.files?.[0];
      if (file) {
        // Validate file type
        if (!file.name.endsWith('.csv')) {
          setError(t('admin.users.bulk_import.error_invalid_file_type'));
          return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          setError(t('admin.users.bulk_import.error_file_too_large'));
          return;
        }

        setSelectedFile(file);
        setError(null);
      }
    },
    [t]
  );

  /**
   * Handle drag over
   */
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  /**
   * Handle upload button click
   */
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setImportState('uploading');
    setError(null);

    try {
      // Read file content
      const content = await selectedFile.text();

      // Call bulk create API
      const response = await adminApi.bulkCreateUsers(content);

      // Set results
      setResults(response);
      setImportState('results');

      // If there were any successful imports, trigger refresh
      if (response.successCount > 0) {
        onSuccess();
      }
    } catch (err) {
      setError(adminApi.getErrorMessage(err));
      setImportState('select');
    }
  }, [selectedFile, adminApi, onSuccess]);

  /**
   * Handle browse button click
   */
  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Render file selection view
   */
  const renderSelectView = () => (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-gray-400"
        onDrop={handleDrop}
        onDragOver={handleDragOver}>
        <PiUploadSimple className="mb-4 h-12 w-12 text-gray-400" />
        <p className="mb-2 text-sm text-gray-600">
          {t('admin.users.bulk_import.drop_zone_text')}
        </p>
        <p className="mb-4 text-xs text-gray-500">
          {t('admin.users.bulk_import.drop_zone_hint')}
        </p>
        <Button variant="secondary" onClick={handleBrowseClick}>
          {t('admin.users.bulk_import.browse_button')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Selected file display */}
      {selectedFile && (
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <PiFileText className="h-5 w-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              {selectedFile.name}
            </span>
            {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
            <span className="text-xs text-gray-500">
              {`(${(selectedFile.size / 1024).toFixed(1)} KB)`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-500">
            <PiX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
        <Button variant="secondary" onClick={handleClose}>
          {t('admin.users.bulk_import.cancel')}
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!selectedFile}
          icon={PiUploadSimple}>
          {t('admin.users.bulk_import.upload')}
        </Button>
      </div>
    </div>
  );

  /**
   * Render uploading view
   */
  const renderUploadingView = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
      <p className="text-sm text-gray-600">
        {t('admin.users.bulk_import.uploading')}
      </p>
    </div>
  );

  /**
   * Render results view
   */
  const renderResultsView = () => {
    if (!results) return null;

    const hasFailures = results.failureCount > 0;
    const hasSuccesses = results.successCount > 0;

    return (
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-gray-50 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {results.totalRows}
            </p>
            <p className="text-xs text-gray-500">
              {t('admin.users.bulk_import.total_rows')}
            </p>
          </div>
          <div className="rounded-lg bg-green-50 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {results.successCount}
            </p>
            <p className="text-xs text-green-600">
              {t('admin.users.bulk_import.success_count')}
            </p>
          </div>
          <div className="rounded-lg bg-red-50 p-4 text-center">
            <p className="text-2xl font-bold text-red-600">
              {results.failureCount}
            </p>
            <p className="text-xs text-red-600">
              {t('admin.users.bulk_import.failure_count')}
            </p>
          </div>
        </div>

        {/* Results table */}
        {results.results.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>
                    {t('admin.users.bulk_import.result_row')}
                  </TableHeaderCell>
                  <TableHeaderCell>
                    {t('admin.users.bulk_import.result_email')}
                  </TableHeaderCell>
                  <TableHeaderCell>
                    {t('admin.users.bulk_import.result_status')}
                  </TableHeaderCell>
                  <TableHeaderCell>
                    {t('admin.users.bulk_import.result_error')}
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.results.map((result) => (
                  <TableRow key={`${result.row}-${result.email}`}>
                    <TableCell>{result.row}</TableCell>
                    <TableCell className="font-medium">{result.email}</TableCell>
                    <TableCell>
                      {result.success ? (
                        <Badge color="green" icon={PiCheckCircle}>
                          {t('admin.users.bulk_import.status_success')}
                        </Badge>
                      ) : (
                        <Badge color="red" icon={PiXCircle}>
                          {t('admin.users.bulk_import.status_failed')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {result.error || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Status message */}
        {hasSuccesses && !hasFailures && (
          <div className="rounded-md bg-green-50 p-3">
            <p className="text-sm text-green-700">
              {t('admin.users.bulk_import.all_success_message')}
            </p>
          </div>
        )}

        {hasFailures && (
          <div className="rounded-md bg-amber-50 p-3">
            <p className="text-sm text-amber-700">
              {t('admin.users.bulk_import.partial_success_message')}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button onClick={handleClose}>
            {t('admin.users.bulk_import.close')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} static={true}>
      <DialogPanel className="max-w-2xl">
        {/* Dialog Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('admin.users.bulk_import.title')}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={importState === 'uploading'}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50">
            <PiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4">
          {importState === 'select' && renderSelectView()}
          {importState === 'uploading' && renderUploadingView()}
          {importState === 'results' && renderResultsView()}
        </div>
      </DialogPanel>
    </Dialog>
  );
};

export default BulkImportDialog;
