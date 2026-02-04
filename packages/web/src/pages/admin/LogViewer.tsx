/**
 * Log Viewer Page Component
 *
 * Displays usage logs with filtering and pagination functionality.
 * Also displays audit logs showing admin actions.
 *
 * Requirements:
 * - 4.1: Display usage logs with timestamp, user, prompt, response, model
 * - 4.2: Show 100 logs per page
 * - 4.3: Filter by date range (start date, end date)
 * - 4.4: Filter by user ID
 * - 4.5: Pagination with next/previous buttons
 * - 5.7: Display audit logs showing admin actions (user created, deleted, role changed, etc.)
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
  TextInput,
  Button,
  Card,
  DatePicker,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
  Badge,
} from '@tremor/react';
import {
  PiCaretLeft,
  PiCaretRight,
  PiFunnel,
  PiX,
  PiDownloadSimple,
  PiClipboardText,
} from 'react-icons/pi';
import useAdminApi, { LogEntry, AuditLogEntry } from '../../hooks/useAdminApi';
import { downloadFile, getCurrentDateString, UTF8_BOM } from '../../utils/csvUtils';

// Page size constant - 100 logs per page as per requirement 4.2
const PAGE_SIZE = 100;

// Audit log page size - 50 logs per page
const AUDIT_LOG_PAGE_SIZE = 50;

/**
 * Truncates text to a specified length with ellipsis
 */
const truncateText = (text: string, maxLength: number): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * LogTable component displays logs in a Tremor Table
 */
interface LogTableProps {
  logs: LogEntry[];
  isLoading: boolean;
}

const LogTable: React.FC<LogTableProps> = ({ logs, isLoading }) => {
  const { t } = useTranslation();

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
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        {t('admin.logs.no_logs_found')}
      </div>
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell className="w-40">
            {t('admin.logs.table.timestamp')}
          </TableHeaderCell>
          <TableHeaderCell className="w-48">
            {t('admin.logs.table.user_id')}
          </TableHeaderCell>
          <TableHeaderCell>{t('admin.logs.table.prompt')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.logs.table.response')}</TableHeaderCell>
          <TableHeaderCell className="w-32">
            {t('admin.logs.table.model')}
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {logs.map((log, index) => (
          <TableRow key={`${log.messageId}-${index}`}>
            <TableCell className="whitespace-nowrap text-sm text-gray-500">
              {formatDate(log.timestamp)}
            </TableCell>
            <TableCell>
              <div className="max-w-[180px] truncate text-sm" title={log.userId}>
                {log.userId}
              </div>
            </TableCell>
            <TableCell>
              <div
                className="max-w-[300px] text-sm text-gray-700"
                title={log.prompt}>
                {truncateText(log.prompt, 100)}
              </div>
            </TableCell>
            <TableCell>
              <div
                className="max-w-[300px] text-sm text-gray-700"
                title={log.response}>
                {truncateText(log.response, 100)}
              </div>
            </TableCell>
            <TableCell className="text-sm text-gray-500">
              {log.model || '-'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/**
 * AuditLogTable component displays audit logs in a Tremor Table
 * Requirement 5.7: Display audit logs showing admin actions
 */
interface AuditLogTableProps {
  logs: AuditLogEntry[];
  isLoading: boolean;
}

const AuditLogTable: React.FC<AuditLogTableProps> = ({ logs, isLoading }) => {
  const { t } = useTranslation();

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
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  /**
   * Get badge color based on action type
   */
  const getActionBadgeColor = (
    action: string
  ): 'blue' | 'red' | 'green' | 'yellow' | 'gray' => {
    switch (action) {
      case 'CREATE_USER':
        return 'green';
      case 'DELETE_USER':
        return 'red';
      case 'GRANT_ADMIN':
        return 'blue';
      case 'REVOKE_ADMIN':
        return 'yellow';
      case 'DISABLE_USER':
        return 'gray';
      case 'ENABLE_USER':
        return 'green';
      default:
        return 'gray';
    }
  };

  /**
   * Get translated action label
   */
  const getActionLabel = (action: string): string => {
    const actionKey = `admin.logs.audit.actions.${action.toLowerCase()}`;
    const translated = t(actionKey);
    // If translation not found, return the action as-is
    return translated === actionKey ? action : translated;
  };

  /**
   * Format details object to readable string
   */
  const formatDetails = (details?: Record<string, unknown>): string => {
    if (!details || Object.keys(details).length === 0) {
      return '-';
    }
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        {t('admin.logs.audit.no_logs_found')}
      </div>
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell className="w-40">
            {t('admin.logs.audit.table.timestamp')}
          </TableHeaderCell>
          <TableHeaderCell className="w-48">
            {t('admin.logs.audit.table.admin_user')}
          </TableHeaderCell>
          <TableHeaderCell className="w-36">
            {t('admin.logs.audit.table.action')}
          </TableHeaderCell>
          <TableHeaderCell className="w-48">
            {t('admin.logs.audit.table.target_user')}
          </TableHeaderCell>
          <TableHeaderCell>
            {t('admin.logs.audit.table.details')}
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {logs.map((log, index) => (
          <TableRow key={`${log.timestamp}-${index}`}>
            <TableCell className="whitespace-nowrap text-sm text-gray-500">
              {formatDate(log.timestamp)}
            </TableCell>
            <TableCell>
              <div
                className="max-w-[180px] truncate text-sm"
                title={log.adminUserId}>
                {log.adminUserId}
              </div>
            </TableCell>
            <TableCell>
              <Badge color={getActionBadgeColor(log.action)} size="sm">
                {getActionLabel(log.action)}
              </Badge>
            </TableCell>
            <TableCell>
              <div
                className="max-w-[180px] truncate text-sm"
                title={log.targetEmail || log.targetUserId || '-'}>
                {log.targetEmail || log.targetUserId || '-'}
              </div>
            </TableCell>
            <TableCell>
              <div
                className="max-w-[300px] truncate text-sm text-gray-500"
                title={formatDetails(log.details)}>
                {formatDetails(log.details)}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/**
 * Pagination component for navigating through log pages
 */
interface PaginationProps {
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  totalCount?: number;
  pageSize: number;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  totalCount,
  pageSize,
}) => {
  const { t } = useTranslation();

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = totalCount
    ? Math.min(currentPage * pageSize, totalCount)
    : currentPage * pageSize;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <Button
          variant="secondary"
          disabled={!hasPreviousPage}
          onClick={onPreviousPage}
          icon={PiCaretLeft}>
          {t('admin.logs.pagination.previous')}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasNextPage}
          onClick={onNextPage}
          icon={PiCaretRight}
          iconPosition="right">
          {t('admin.logs.pagination.next')}
        </Button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            {totalCount !== undefined ? (
              <>
                {t('admin.logs.pagination.showing')}{' '}
                <span className="font-medium">{startItem}</span>{' '}
                {t('admin.logs.pagination.to')}{' '}
                <span className="font-medium">{endItem}</span>{' '}
                {t('admin.logs.pagination.of')}{' '}
                <span className="font-medium">{totalCount}</span>{' '}
                {t('admin.logs.pagination.results')}
              </>
            ) : (
              <>
                {t('admin.logs.pagination.page')}{' '}
                <span className="font-medium">{currentPage}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!hasPreviousPage}
            onClick={onPreviousPage}
            icon={PiCaretLeft}>
            {t('admin.logs.pagination.previous')}
          </Button>
          <Button
            variant="secondary"
            disabled={!hasNextPage}
            onClick={onNextPage}
            icon={PiCaretRight}
            iconPosition="right">
            {t('admin.logs.pagination.next')}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Main LogViewer page component
 */
const LogViewer: React.FC = () => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // ========== Usage Logs State ==========
  // Filter state
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [userIdFilter, setUserIdFilter] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{
    startDate?: string;
    endDate?: string;
    userId?: string;
  }>({});

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Pagination state - store tokens for each page
  const [pageTokens, setPageTokens] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Get current page token
  const currentToken = pageTokens[currentPageIndex];

  // ========== Audit Logs State ==========
  const [auditPageTokens, setAuditPageTokens] = useState<
    (string | undefined)[]
  >([undefined]);
  const [auditCurrentPageIndex, setAuditCurrentPageIndex] = useState(0);
  const auditCurrentToken = auditPageTokens[auditCurrentPageIndex];

  // Format date to ISO string for API
  const formatDateForApi = (date: Date | undefined): string | undefined => {
    if (!date) return undefined;
    return date.toISOString().split('T')[0];
  };

  // Fetch usage logs with SWR
  const { data, error, isLoading } = adminApi.listLogs(
    {
      startDate: appliedFilters.startDate,
      endDate: appliedFilters.endDate,
      userId: appliedFilters.userId || undefined,
      nextToken: currentToken,
      limit: PAGE_SIZE,
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  // Fetch audit logs with SWR
  const {
    data: auditData,
    error: auditError,
    isLoading: auditIsLoading,
  } = adminApi.listAuditLogs(
    {
      nextToken: auditCurrentToken,
      limit: AUDIT_LOG_PAGE_SIZE,
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  /**
   * Apply filters and reset pagination
   */
  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({
      startDate: formatDateForApi(startDate),
      endDate: formatDateForApi(endDate),
      userId: userIdFilter.trim() || undefined,
    });
    // Reset pagination when filters change
    setPageTokens([undefined]);
    setCurrentPageIndex(0);
  }, [startDate, endDate, userIdFilter]);

  /**
   * Clear all filters
   */
  const handleClearFilters = useCallback(() => {
    setStartDate(undefined);
    setEndDate(undefined);
    setUserIdFilter('');
    setAppliedFilters({});
    // Reset pagination
    setPageTokens([undefined]);
    setCurrentPageIndex(0);
  }, []);

  /**
   * Handle user ID filter input change
   */
  const handleUserIdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUserIdFilter(e.target.value);
    },
    []
  );

  /**
   * Handle next page for usage logs
   */
  const handleNextPage = useCallback(() => {
    if (data?.nextToken) {
      // Store the next token if we haven't visited this page yet
      if (currentPageIndex === pageTokens.length - 1) {
        setPageTokens((prev) => [...prev, data.nextToken]);
      }
      setCurrentPageIndex((prev) => prev + 1);
    }
  }, [data?.nextToken, currentPageIndex, pageTokens.length]);

  /**
   * Handle previous page for usage logs
   */
  const handlePreviousPage = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex((prev) => prev - 1);
    }
  }, [currentPageIndex]);

  /**
   * Handle next page for audit logs
   */
  const handleAuditNextPage = useCallback(() => {
    if (auditData?.nextToken) {
      if (auditCurrentPageIndex === auditPageTokens.length - 1) {
        setAuditPageTokens((prev) => [...prev, auditData.nextToken]);
      }
      setAuditCurrentPageIndex((prev) => prev + 1);
    }
  }, [auditData?.nextToken, auditCurrentPageIndex, auditPageTokens.length]);

  /**
   * Handle previous page for audit logs
   */
  const handleAuditPreviousPage = useCallback(() => {
    if (auditCurrentPageIndex > 0) {
      setAuditCurrentPageIndex((prev) => prev - 1);
    }
  }, [auditCurrentPageIndex]);

  /**
   * Handle CSV export
   * Requirement 4.6: Export filtered logs to CSV file
   */
  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    try {
      // Call the export API with current filters
      const csvContent = await adminApi.exportLogs({
        startDate: appliedFilters.startDate,
        endDate: appliedFilters.endDate,
        userId: appliedFilters.userId,
      });

      // Generate filename with current date
      const filename = `logs_export_${getCurrentDateString()}.csv`;

      // Add UTF-8 BOM if not already present (API should return with BOM, but ensure it)
      const contentWithBom = csvContent.startsWith(UTF8_BOM)
        ? csvContent
        : UTF8_BOM + csvContent;

      // Trigger file download
      downloadFile(contentWithBom, filename);
    } catch (err) {
      console.error('Failed to export logs:', err);
      // Error will be displayed via the error state
    } finally {
      setIsExporting(false);
    }
  }, [adminApi, appliedFilters]);

  // Check if any filters are applied
  const hasActiveFilters = useMemo(() => {
    return !!(
      appliedFilters.startDate ||
      appliedFilters.endDate ||
      appliedFilters.userId
    );
  }, [appliedFilters]);

  // Compute pagination state for usage logs
  const hasNextPage = !!data?.nextToken;
  const hasPreviousPage = currentPageIndex > 0;
  const currentPage = currentPageIndex + 1;

  // Compute pagination state for audit logs
  const auditHasNextPage = !!auditData?.nextToken;
  const auditHasPreviousPage = auditCurrentPageIndex > 0;
  const auditCurrentPage = auditCurrentPageIndex + 1;

  // Get logs from response
  const logs = useMemo(() => data?.logs ?? [], [data?.logs]);
  const auditLogs = useMemo(() => auditData?.logs ?? [], [auditData?.logs]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.logs.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('admin.logs.description')}
          </p>
        </div>
        {activeTab === 0 && (
          <div>
            <Button
              icon={PiDownloadSimple}
              onClick={handleExportCSV}
              loading={isExporting}
              disabled={isExporting || isLoading}>
              {t('admin.logs.export_csv_button')}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs for Usage Logs and Audit Logs */}
      <TabGroup index={activeTab} onIndexChange={setActiveTab}>
        <TabList variant="solid">
          <Tab icon={PiFunnel}>{t('admin.logs.tabs.usage_logs')}</Tab>
          <Tab icon={PiClipboardText}>{t('admin.logs.tabs.audit_logs')}</Tab>
        </TabList>
        <TabPanels>
          {/* Usage Logs Tab */}
          <TabPanel>
            <div className="mt-4 space-y-4">
              {/* Filters */}
              <Card>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <PiFunnel className="h-5 w-5 text-gray-500" />
                    <h2 className="text-lg font-medium text-gray-900">
                      {t('admin.logs.filters.title')}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Start Date Filter */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t('admin.logs.filters.start_date')}
                      </label>
                      <DatePicker
                        value={startDate}
                        onValueChange={setStartDate}
                        placeholder={t('admin.logs.filters.select_date')}
                        enableClear={true}
                      />
                    </div>

                    {/* End Date Filter */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t('admin.logs.filters.end_date')}
                      </label>
                      <DatePicker
                        value={endDate}
                        onValueChange={setEndDate}
                        placeholder={t('admin.logs.filters.select_date')}
                        enableClear={true}
                      />
                    </div>

                    {/* User ID Filter */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t('admin.logs.filters.user_id')}
                      </label>
                      <TextInput
                        placeholder={t('admin.logs.filters.user_id_placeholder')}
                        value={userIdFilter}
                        onChange={handleUserIdChange}
                      />
                    </div>

                    {/* Filter Actions */}
                    <div className="flex items-end gap-2">
                      <Button onClick={handleApplyFilters}>
                        {t('admin.logs.filters.apply')}
                      </Button>
                      {hasActiveFilters && (
                        <Button
                          variant="secondary"
                          icon={PiX}
                          onClick={handleClearFilters}>
                          {t('admin.logs.filters.clear')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Active Filters Display */}
                  {hasActiveFilters && (
                    <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                      <span className="text-sm text-gray-500">
                        {t('admin.logs.filters.active_filters')}{t('common.colon')}
                      </span>
                      {appliedFilters.startDate && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          {t('admin.logs.filters.start_date')}{t('common.colon')}{' '}
                          {appliedFilters.startDate}
                        </span>
                      )}
                      {appliedFilters.endDate && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          {t('admin.logs.filters.end_date')}{t('common.colon')}{' '}
                          {appliedFilters.endDate}
                        </span>
                      )}
                      {appliedFilters.userId && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          {t('admin.logs.filters.user_id')}{t('common.colon')}{' '}
                          {appliedFilters.userId}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Error Display */}
              {error && (
                <Card className="border-red-200 bg-red-50">
                  <p className="text-red-700">{adminApi.getErrorMessage(error)}</p>
                </Card>
              )}

              {/* Log Table */}
              <Card className="overflow-hidden p-0">
                <LogTable logs={logs} isLoading={isLoading} />

                {/* Pagination */}
                {logs.length > 0 && (
                  <Pagination
                    currentPage={currentPage}
                    hasNextPage={hasNextPage}
                    hasPreviousPage={hasPreviousPage}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                    totalCount={data?.count}
                    pageSize={PAGE_SIZE}
                  />
                )}
              </Card>
            </div>
          </TabPanel>

          {/* Audit Logs Tab */}
          <TabPanel>
            <div className="mt-4 space-y-4">
              {/* Audit Logs Description */}
              <Card>
                <div className="flex items-center gap-2">
                  <PiClipboardText className="h-5 w-5 text-gray-500" />
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">
                      {t('admin.logs.audit.title')}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {t('admin.logs.audit.description')}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Error Display */}
              {auditError && (
                <Card className="border-red-200 bg-red-50">
                  <p className="text-red-700">
                    {adminApi.getErrorMessage(auditError)}
                  </p>
                </Card>
              )}

              {/* Audit Log Table */}
              <Card className="overflow-hidden p-0">
                <AuditLogTable logs={auditLogs} isLoading={auditIsLoading} />

                {/* Pagination */}
                {auditLogs.length > 0 && (
                  <Pagination
                    currentPage={auditCurrentPage}
                    hasNextPage={auditHasNextPage}
                    hasPreviousPage={auditHasPreviousPage}
                    onNextPage={handleAuditNextPage}
                    onPreviousPage={handleAuditPreviousPage}
                    totalCount={auditData?.count}
                    pageSize={AUDIT_LOG_PAGE_SIZE}
                  />
                )}
              </Card>
            </div>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
};

export default LogViewer;
