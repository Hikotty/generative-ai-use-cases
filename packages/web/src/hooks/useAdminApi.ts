/**
 * Admin API client hook for admin dashboard.
 *
 * This hook provides methods for calling all admin backend endpoints:
 * - Users: list, create, update, delete, bulk import
 * - Logs: list, export, audit logs
 * - Stats: get costs, get usage stats
 * - RAG: sync status, list documents, upload, delete, download
 * - Settings: get, update, upload icon
 * - Deploy: generate template, get history
 *
 * Requirements:
 * - 11.1: API calls include JWT token in Authorization header
 * - 11.2: Handle API errors gracefully with user-friendly messages
 */

import useHttp from './useHttp';
import { SWRConfiguration } from 'swr';

// ============================================================================
// Type Definitions
// ============================================================================

// User Management Types
export interface UserResponse {
  userId: string;
  email: string;
  isAdmin: boolean;
  status: 'active' | 'disabled';
  createdAt: string;
  emailVerified: boolean;
}

export interface ListUsersResponse {
  users: UserResponse[];
  nextToken?: string;
  totalCount?: number;
}

export interface CreateUserRequest {
  email: string;
  isAdmin?: boolean;
}

export interface UpdateUserRequest {
  isAdmin?: boolean;
  enabled?: boolean;
}

export interface BulkRegistrationResult {
  row: number;
  email: string;
  success: boolean;
  error?: string;
}

export interface BulkRegistrationResponse {
  totalRows: number;
  successCount: number;
  failureCount: number;
  results: BulkRegistrationResult[];
}

// Log Types
export interface LogEntry {
  timestamp: string;
  userId: string;
  chatId: string;
  messageId: string;
  prompt: string;
  response: string;
  model?: string;
  usecase?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ListLogsResponse {
  logs: LogEntry[];
  nextToken?: string;
  count: number;
}

export interface AuditLogEntry {
  timestamp: string;
  adminUserId: string;
  action: string;
  targetUserId?: string;
  targetEmail?: string;
  details?: Record<string, unknown>;
}

export interface ListAuditLogsResponse {
  logs: AuditLogEntry[];
  nextToken?: string;
  count: number;
}

// Cost and Stats Types
export interface ModelCostBreakdown {
  modelId: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

export interface UserCostBreakdown {
  userId: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

export interface DailyCostData {
  date: string;
  cost: number;
}

export interface CostStatisticsResponse {
  totalCost: number;
  byModel: ModelCostBreakdown[];
  byUser: UserCostBreakdown[];
  dailyCosts: DailyCostData[];
  startDate: string;
  endDate: string;
}

export interface ModelUsageStats {
  modelId: string;
  requestCount: number;
  totalTokens: number;
}

export interface UseCaseUsageStats {
  usecase: string;
  requestCount: number;
}

export interface UsageStatisticsResponse {
  activeUsers: number;
  totalQuestions: number;
  popularModels: ModelUsageStats[];
  useCaseFrequency: UseCaseUsageStats[];
  startDate: string;
  endDate: string;
}

// RAG Document Types
export interface SyncJobStatus {
  syncInProgress: boolean;
  jobId?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  documentsProcessed?: number;
  documentsFailed?: number;
  failureReasons?: string[];
}

export interface DocumentEntry {
  id: string;
  fileName: string;
  size: number;
  uploadedAt: string;
  contentType?: string;
  extension: string;
}

export interface ListDocumentsResponse {
  documents: DocumentEntry[];
  nextToken?: string;
  count: number;
}

export interface UploadDocumentRequest {
  fileName: string;
  fileSize: number;
  contentType?: string;
}

export interface UploadDocumentResponse {
  uploadUrl: string;
  documentId: string;
  expiresAt: string;
}

export interface DownloadDocumentResponse {
  downloadUrl: string;
  documentId: string;
  expiresAt: string;
}

// Settings Types
export interface UseCaseConfig {
  title: string;
  icon: string;
  enabled?: boolean;
}

export interface AppSettings {
  appName: string;
  welcomeMessage: string;
  useCases: Record<string, UseCaseConfig>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface IconUploadRequest {
  fileName: string;
  fileSize: number;
  contentType?: string;
}

export interface IconUploadResponse {
  uploadUrl: string;
  iconUrl: string;
  expiresAt: string;
}

// Deploy Types
export interface DeployParameters {
  ragEnabled?: boolean;
  agentEnabled?: boolean;
  useCaseBuilderEnabled?: boolean;
  searchApiKey?: string;
  modelId?: string;
  stackName?: string;
  [key: string]: unknown;
}

export interface GenerateTemplateRequest {
  parameters: DeployParameters;
}

export interface GenerateTemplateResponse {
  quickCreateLink: string;
  downloadLink: string;
  templateKey: string;
  generatedAt: string;
  stackName: string;
}

export interface TemplateHistoryEntry {
  id: string;
  createdDate: string;
  adminUserId: string;
  adminEmail?: string;
  parameters: DeployParameters;
  quickCreateLink: string;
  downloadLink: string;
  templateKey: string;
  stackName: string;
}

export interface TemplateHistoryResponse {
  history: TemplateHistoryEntry[];
  count: number;
}

// Error Types
export interface AdminApiError {
  message: string;
  statusCode?: number;
  details?: unknown;
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Extracts a user-friendly error message from an API error.
 *
 * Requirement 11.2: Handle API errors gracefully with user-friendly messages
 *
 * @param error - The error object from the API call
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (!error) {
    return 'An unknown error occurred';
  }

  // Handle Axios errors
  if (typeof error === 'object' && error !== null) {
    const axiosError = error as {
      response?: {
        data?: { error?: string; message?: string };
        status?: number;
      };
      message?: string;
    };

    // Check for response data error message
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error;
    }

    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message;
    }

    // Check for HTTP status codes
    if (axiosError.response?.status) {
      switch (axiosError.response.status) {
        case 400:
          return 'Invalid request. Please check your input.';
        case 401:
          return 'Authentication required. Please log in again.';
        case 403:
          return 'Access denied. Admin privileges required.';
        case 404:
          return 'Resource not found.';
        case 500:
          return 'Server error. Please try again later.';
        case 504:
          return 'Request timed out. Please try again.';
        default:
          return `Request failed with status ${axiosError.response.status}`;
      }
    }

    // Check for generic error message
    if (axiosError.message) {
      return axiosError.message;
    }
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred';
}

// ============================================================================
// Admin API Hook
// ============================================================================

/**
 * Hook for accessing admin API endpoints.
 *
 * Uses the existing useHttp hook for HTTP requests with automatic
 * JWT token handling via Amplify Auth.
 *
 * Requirements:
 * - 11.1: API calls include JWT token in Authorization header
 * - 11.2: Handle API errors gracefully with user-friendly messages
 */
const useAdminApi = () => {
  const http = useHttp();

  return {
    // ========================================================================
    // User Management APIs
    // ========================================================================

    /**
     * Lists all users with optional filtering and pagination.
     *
     * @param params - Query parameters
     * @param config - SWR configuration
     * @returns SWR response with user list
     */
    listUsers: (
      params?: {
        search?: string;
        nextToken?: string;
        limit?: number;
      },
      config?: SWRConfiguration
    ) => {
      const queryParams = new URLSearchParams();
      if (params?.search) queryParams.set('search', params.search);
      if (params?.nextToken) queryParams.set('nextToken', params.nextToken);
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const queryString = queryParams.toString();
      const url = `admin/users${queryString ? `?${queryString}` : ''}`;

      return http.get<ListUsersResponse>(url, config);
    },

    /**
     * Creates a new user.
     *
     * @param request - User creation request
     * @returns Promise with created user
     */
    createUser: async (request: CreateUserRequest) => {
      const response = await http.post<{ user: UserResponse }>(
        'admin/users',
        request
      );
      return response.data;
    },

    /**
     * Updates a user's attributes.
     *
     * @param userId - User ID to update
     * @param request - Update request
     * @returns Promise with update result
     */
    updateUser: async (userId: string, request: UpdateUserRequest) => {
      const response = await http.put<{ message: string; userId: string }>(
        `admin/users/${encodeURIComponent(userId)}`,
        request
      );
      return response.data;
    },

    /**
     * Deletes a user.
     *
     * @param userId - User ID to delete
     * @returns Promise with deletion result
     */
    deleteUser: async (userId: string) => {
      const response = await http.delete<{ message: string; userId: string }>(
        `admin/users/${encodeURIComponent(userId)}`
      );
      return response.data;
    },

    /**
     * Bulk creates users from CSV content.
     *
     * @param csv - CSV content with user data
     * @param isAdmin - Whether to grant admin role to all users
     * @returns Promise with bulk registration results
     */
    bulkCreateUsers: async (csv: string, isAdmin?: boolean) => {
      const response = await http.post<BulkRegistrationResponse>(
        'admin/users/bulk',
        { csv, isAdmin }
      );
      return response.data;
    },

    // ========================================================================
    // Log APIs
    // ========================================================================

    /**
     * Lists usage logs with optional filtering and pagination.
     *
     * @param params - Query parameters
     * @param config - SWR configuration
     * @returns SWR response with log list
     */
    listLogs: (
      params?: {
        startDate?: string;
        endDate?: string;
        userId?: string;
        nextToken?: string;
        limit?: number;
      },
      config?: SWRConfiguration
    ) => {
      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.set('startDate', params.startDate);
      if (params?.endDate) queryParams.set('endDate', params.endDate);
      if (params?.userId) queryParams.set('userId', params.userId);
      if (params?.nextToken) queryParams.set('nextToken', params.nextToken);
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const queryString = queryParams.toString();
      const url = `admin/logs${queryString ? `?${queryString}` : ''}`;

      return http.get<ListLogsResponse>(url, config);
    },

    /**
     * Exports logs as CSV.
     *
     * @param params - Filter parameters
     * @returns Promise with CSV content
     */
    exportLogs: async (params?: {
      startDate?: string;
      endDate?: string;
      userId?: string;
    }) => {
      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.set('startDate', params.startDate);
      if (params?.endDate) queryParams.set('endDate', params.endDate);
      if (params?.userId) queryParams.set('userId', params.userId);

      const queryString = queryParams.toString();
      const url = `admin/logs/export${queryString ? `?${queryString}` : ''}`;

      const response = await http.api.get<string>(url, {
        responseType: 'text',
      });
      return response.data;
    },

    /**
     * Lists audit logs with optional filtering and pagination.
     *
     * @param params - Query parameters
     * @param config - SWR configuration
     * @returns SWR response with audit log list
     */
    listAuditLogs: (
      params?: {
        adminUserId?: string;
        startDate?: string;
        endDate?: string;
        nextToken?: string;
        limit?: number;
      },
      config?: SWRConfiguration
    ) => {
      const queryParams = new URLSearchParams();
      if (params?.adminUserId)
        queryParams.set('adminUserId', params.adminUserId);
      if (params?.startDate) queryParams.set('startDate', params.startDate);
      if (params?.endDate) queryParams.set('endDate', params.endDate);
      if (params?.nextToken) queryParams.set('nextToken', params.nextToken);
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const queryString = queryParams.toString();
      const url = `admin/audit-logs${queryString ? `?${queryString}` : ''}`;

      return http.get<ListAuditLogsResponse>(url, config);
    },

    // ========================================================================
    // Cost and Stats APIs
    // ========================================================================

    /**
     * Gets cost statistics.
     *
     * @param params - Query parameters
     * @param config - SWR configuration
     * @returns SWR response with cost statistics
     */
    getCosts: (
      params?: {
        period?: 'day' | 'week' | 'month';
        startDate?: string;
        endDate?: string;
      },
      config?: SWRConfiguration
    ) => {
      const queryParams = new URLSearchParams();
      if (params?.period) queryParams.set('period', params.period);
      if (params?.startDate) queryParams.set('startDate', params.startDate);
      if (params?.endDate) queryParams.set('endDate', params.endDate);

      const queryString = queryParams.toString();
      const url = `admin/costs${queryString ? `?${queryString}` : ''}`;

      return http.get<CostStatisticsResponse>(url, config);
    },

    /**
     * Gets usage statistics.
     *
     * @param params - Query parameters
     * @param config - SWR configuration
     * @returns SWR response with usage statistics
     */
    getStats: (
      params?: {
        period?: 'day' | 'week' | 'month';
        startDate?: string;
        endDate?: string;
      },
      config?: SWRConfiguration
    ) => {
      const queryParams = new URLSearchParams();
      if (params?.period) queryParams.set('period', params.period);
      if (params?.startDate) queryParams.set('startDate', params.startDate);
      if (params?.endDate) queryParams.set('endDate', params.endDate);

      const queryString = queryParams.toString();
      const url = `admin/stats${queryString ? `?${queryString}` : ''}`;

      return http.get<UsageStatisticsResponse>(url, config);
    },

    // ========================================================================
    // RAG Document APIs
    // ========================================================================

    /**
     * Gets the current sync job status.
     *
     * @param config - SWR configuration
     * @returns SWR response with sync status
     */
    getSyncStatus: (config?: SWRConfiguration) => {
      return http.get<SyncJobStatus>('admin/rag/sync-status', config);
    },

    /**
     * Lists RAG documents.
     *
     * @param params - Query parameters
     * @param config - SWR configuration
     * @returns SWR response with document list
     */
    listDocuments: (
      params?: {
        search?: string;
        nextToken?: string;
        limit?: number;
      },
      config?: SWRConfiguration
    ) => {
      const queryParams = new URLSearchParams();
      if (params?.search) queryParams.set('search', params.search);
      if (params?.nextToken) queryParams.set('nextToken', params.nextToken);
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const queryString = queryParams.toString();
      const url = `admin/rag/documents${queryString ? `?${queryString}` : ''}`;

      return http.get<ListDocumentsResponse>(url, config);
    },

    /**
     * Gets a presigned URL for document upload.
     *
     * @param request - Upload request with file metadata
     * @returns Promise with upload URL and document ID
     */
    uploadDocument: async (request: UploadDocumentRequest) => {
      const response = await http.post<UploadDocumentResponse>(
        'admin/rag/documents',
        request
      );
      return response.data;
    },

    /**
     * Completes the upload and starts sync job.
     *
     * @returns Promise with sync job ID
     */
    completeUpload: async () => {
      const response = await http.post<{ message: string; jobId: string }>(
        'admin/rag/documents/complete',
        {}
      );
      return response.data;
    },

    /**
     * Deletes a document.
     *
     * @param documentId - Document ID to delete
     * @returns Promise with deletion result
     */
    deleteDocument: async (documentId: string) => {
      const response = await http.delete<{
        message: string;
        documentId: string;
        syncJobId: string;
      }>(`admin/rag/documents/${encodeURIComponent(documentId)}`);
      return response.data;
    },

    /**
     * Gets a presigned URL for document download.
     *
     * @param documentId - Document ID to download
     * @returns Promise with download URL
     */
    downloadDocument: async (documentId: string) => {
      const response = await http.api.get<DownloadDocumentResponse>(
        `admin/rag/documents/${encodeURIComponent(documentId)}/download`
      );
      return response.data;
    },

    // ========================================================================
    // Settings APIs
    // ========================================================================

    /**
     * Gets the current application settings.
     *
     * @param config - SWR configuration
     * @returns SWR response with settings
     */
    getSettings: (config?: SWRConfiguration) => {
      return http.get<AppSettings>('admin/settings', config);
    },

    /**
     * Updates application settings.
     *
     * @param settings - Partial settings to update
     * @returns Promise with updated settings
     */
    updateSettings: async (settings: Partial<AppSettings>) => {
      const response = await http.put<{
        message: string;
        settings: AppSettings;
      }>('admin/settings', settings);
      return response.data;
    },

    /**
     * Gets a presigned URL for icon upload.
     *
     * @param request - Icon upload request with file metadata
     * @returns Promise with upload URL and icon URL
     */
    uploadIcon: async (request: IconUploadRequest) => {
      const response = await http.post<IconUploadResponse>(
        'admin/settings/icon',
        request
      );
      return response.data;
    },

    // ========================================================================
    // Deploy APIs
    // ========================================================================

    /**
     * Generates a CloudFormation template.
     *
     * @param request - Template generation request with parameters
     * @returns Promise with Quick Create Link and download URL
     */
    generateTemplate: async (request: GenerateTemplateRequest) => {
      const response = await http.post<GenerateTemplateResponse>(
        'admin/deploy/generate',
        request
      );
      return response.data;
    },

    /**
     * Gets template generation history.
     *
     * @param params - Query parameters
     * @param config - SWR configuration
     * @returns SWR response with history entries
     */
    getTemplateHistory: (
      params?: {
        limit?: number;
      },
      config?: SWRConfiguration
    ) => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const queryString = queryParams.toString();
      const url = `admin/deploy/history${queryString ? `?${queryString}` : ''}`;

      return http.get<TemplateHistoryResponse>(url, config);
    },

    // ========================================================================
    // Utility Functions
    // ========================================================================

    /**
     * Gets a user-friendly error message from an API error.
     */
    getErrorMessage,

    /**
     * Direct access to the underlying HTTP client for custom requests.
     */
    http,
  };
};

export default useAdminApi;
