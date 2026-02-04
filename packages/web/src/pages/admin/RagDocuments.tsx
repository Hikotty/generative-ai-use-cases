/**
 * RAG Documents Management Page Component
 *
 * Displays a list of RAG documents with search functionality.
 *
 * Requirements:
 * - 20.4: Display document list from Knowledge Base data source
 * - 20.5: Show file name, size, upload date, status for each document
 * - 20.21: Search functionality to filter documents by file name
 */

import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-icons/pi';
import useAdminApi, { DocumentEntry } from '../../hooks/useAdminApi';
import { useDebounce } from 'use-debounce';

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
 * DocumentTable component displays documents in a Tremor Table
 */
interface DocumentTableProps {
  documents: DocumentEntry[];
  isLoading: boolean;
}

const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  isLoading,
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
        </TableRow>
      </TableHead>
      <TableBody>
        {documents.map((doc) => (
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/**
 * Main RagDocuments page component
 */
const RagDocuments: React.FC = () => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  // Fetch documents with SWR
  const { data, error, isLoading } = adminApi.listDocuments(
    {
      search: debouncedSearch || undefined,
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('admin.rag.title')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('admin.rag.description')}
        </p>
      </div>

      {/* Search */}
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

          {/* Document Count */}
          {data && (
            <div className="text-sm text-gray-500">
              {t('admin.rag.document_count', { count: data.count })}
            </div>
          )}
        </div>
      </Card>

      {/* Documents Table */}
      <Card>
        <DocumentTable documents={documents} isLoading={isLoading} />
      </Card>
    </div>
  );
};

export default RagDocuments;
