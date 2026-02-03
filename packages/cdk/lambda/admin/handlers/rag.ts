/**
 * RAG document management Lambda handler for admin dashboard.
 *
 * This module provides handlers for RAG document management operations:
 * - GET /admin/rag/sync-status: Get sync job status
 * - GET /admin/rag/documents: List documents in Knowledge Base data source
 * - POST /admin/rag/documents: Upload document (generate presigned URL)
 * - DELETE /admin/rag/documents/{id}: Delete document
 * - GET /admin/rag/documents/{id}/download: Download document
 *
 * Requirements:
 * - 20.1: Check current sync job status using ListIngestionJobs API
 * - 20.4: Display document list from Knowledge Base data source
 * - 20.5: Display file name, size, upload date, status for each document
 * - 20.6: Show file selection dialog when upload button is clicked
 * - 20.7: Accept supported file formats
 * - 20.8: Validate text document size (max 50MB)
 * - 20.9: Validate image file size (max 3.75MB)
 * - 20.10: Save files to Bedrock Knowledge Base data source S3 bucket
 * - 20.11: Start sync using StartIngestionJob API after upload
 * - 20.16: Delete document from S3 and re-sync
 * - 20.17: Download document from S3
 * - 20.18: Record audit logs for upload/delete operations
 * - 20.21: Search documents by file name
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BedrockAgentClient,
  ListIngestionJobsCommand,
  StartIngestionJobCommand,
  IngestionJobStatus,
} from '@aws-sdk/client-bedrock-agent';
import {
  checkAdminRole,
  getAdminUserId,
  getAdminEmail,
} from '../utils/roleCheck';
import {
  createForbiddenResponse,
  createSuccessResponse,
  handleError,
  logError,
  createBadRequestResponse,
  createNotFoundResponse,
} from '../utils/errorResponse';
import { recordAuditLog, AuditAction } from '../utils/auditLog';

// S3 client singleton
let s3Client: S3Client | null = null;

// Bedrock Agent client singleton
let bedrockAgentClient: BedrockAgentClient | null = null;

/**
 * Gets or creates the S3 client.
 */
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({});
  }
  return s3Client;
}

/**
 * Gets or creates the Bedrock Agent client.
 */
function getBedrockAgentClient(): BedrockAgentClient {
  if (!bedrockAgentClient) {
    bedrockAgentClient = new BedrockAgentClient({});
  }
  return bedrockAgentClient;
}

/**
 * Gets the RAG bucket name from environment variable.
 */
function getRagBucketName(): string {
  const bucketName = process.env.RAG_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('RAG_BUCKET_NAME environment variable is not set');
  }
  return bucketName;
}

/**
 * Gets the Knowledge Base ID from environment variable.
 */
function getKnowledgeBaseId(): string {
  const kbId = process.env.KNOWLEDGE_BASE_ID;
  if (!kbId) {
    throw new Error('KNOWLEDGE_BASE_ID environment variable is not set');
  }
  return kbId;
}

/**
 * Gets the Data Source ID from environment variable.
 */
function getDataSourceId(): string {
  const dsId = process.env.DATA_SOURCE_ID;
  if (!dsId) {
    throw new Error('DATA_SOURCE_ID environment variable is not set');
  }
  return dsId;
}

/**
 * Supported file extensions for text documents.
 * Max size: 50MB
 */
export const TEXT_DOCUMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.html',
  '.doc',
  '.docx',
  '.csv',
  '.xls',
  '.xlsx',
  '.pdf',
];

/**
 * Supported file extensions for image files.
 * Max size: 3.75MB
 */
export const IMAGE_FILE_EXTENSIONS = ['.jpeg', '.jpg', '.png'];

/**
 * All supported file extensions.
 */
export const SUPPORTED_EXTENSIONS = [
  ...TEXT_DOCUMENT_EXTENSIONS,
  ...IMAGE_FILE_EXTENSIONS,
];

/**
 * Maximum file size for text documents in bytes (50MB).
 */
export const MAX_TEXT_DOCUMENT_SIZE = 50 * 1024 * 1024;

/**
 * Maximum file size for image files in bytes (3.75MB).
 */
export const MAX_IMAGE_FILE_SIZE = 3.75 * 1024 * 1024;

/**
 * Sync job status response structure.
 */
export interface SyncJobStatus {
  /** Whether a sync job is currently in progress */
  syncInProgress: boolean;
  /** Latest job ID if available */
  jobId?: string;
  /** Job status */
  status?: string;
  /** Job start time */
  startedAt?: string;
  /** Job completion time */
  completedAt?: string;
  /** Number of documents processed */
  documentsProcessed?: number;
  /** Number of documents failed */
  documentsFailed?: number;
  /** Failure reasons if any */
  failureReasons?: string[];
}

/**
 * Document entry response structure.
 */
export interface DocumentEntry {
  /** Document ID (S3 key) */
  id: string;
  /** File name */
  fileName: string;
  /** File size in bytes */
  size: number;
  /** Upload date in ISO 8601 format */
  uploadedAt: string;
  /** Content type */
  contentType?: string;
  /** File extension */
  extension: string;
}

/**
 * List documents response structure.
 */
export interface ListDocumentsResponse {
  /** Array of documents */
  documents: DocumentEntry[];
  /** Pagination token for next page */
  nextToken?: string;
  /** Total count of documents */
  count: number;
}

/**
 * Upload request structure.
 */
export interface UploadRequest {
  /** File name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** Content type */
  contentType?: string;
}

/**
 * Upload response structure.
 */
export interface UploadResponse {
  /** Presigned URL for upload */
  uploadUrl: string;
  /** Document ID (S3 key) */
  documentId: string;
  /** Expiration time for the presigned URL */
  expiresAt: string;
}

/**
 * Gets the file extension from a file name.
 *
 * @param fileName - File name
 * @returns File extension (lowercase, including dot)
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) {
    return '';
  }
  return fileName.substring(lastDot).toLowerCase();
}

/**
 * Checks if a file extension is supported.
 *
 * Requirement 20.7: Accept supported file formats
 *
 * @param extension - File extension (including dot)
 * @returns true if supported, false otherwise
 */
export function isSupportedExtension(extension: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(extension.toLowerCase());
}

/**
 * Checks if a file extension is for a text document.
 *
 * @param extension - File extension (including dot)
 * @returns true if text document, false otherwise
 */
export function isTextDocument(extension: string): boolean {
  return TEXT_DOCUMENT_EXTENSIONS.includes(extension.toLowerCase());
}

/**
 * Checks if a file extension is for an image file.
 *
 * @param extension - File extension (including dot)
 * @returns true if image file, false otherwise
 */
export function isImageFile(extension: string): boolean {
  return IMAGE_FILE_EXTENSIONS.includes(extension.toLowerCase());
}

/**
 * Validates file size based on file type.
 *
 * Requirements:
 * - 20.8: Validate text document size (max 50MB)
 * - 20.9: Validate image file size (max 3.75MB)
 *
 * Property 18: File size validation
 *
 * @param fileSize - File size in bytes
 * @param extension - File extension (including dot)
 * @returns Validation result with error message if invalid
 */
export function validateFileSize(
  fileSize: number,
  extension: string
): { valid: boolean; error?: string; maxSize?: number } {
  if (fileSize <= 0) {
    return { valid: false, error: 'File size must be greater than 0' };
  }

  if (isTextDocument(extension)) {
    if (fileSize > MAX_TEXT_DOCUMENT_SIZE) {
      return {
        valid: false,
        error: `Text document size exceeds maximum limit of 50MB`,
        maxSize: MAX_TEXT_DOCUMENT_SIZE,
      };
    }
  } else if (isImageFile(extension)) {
    if (fileSize > MAX_IMAGE_FILE_SIZE) {
      return {
        valid: false,
        error: `Image file size exceeds maximum limit of 3.75MB`,
        maxSize: MAX_IMAGE_FILE_SIZE,
      };
    }
  }

  return { valid: true };
}

/**
 * Determines UI button state based on sync job status.
 *
 * Property 17: Sync job UI state management
 *
 * @param status - Ingestion job status
 * @returns Whether buttons should be disabled
 */
export function shouldDisableButtons(status: string | undefined): boolean {
  if (!status) {
    return false;
  }
  return status === IngestionJobStatus.IN_PROGRESS || status === 'STARTING';
}

/**
 * Handler for GET /admin/rag/sync-status endpoint.
 *
 * Gets the current sync job status from Bedrock Knowledge Base.
 *
 * Requirement 20.1: Check current sync job status using ListIngestionJobs API
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with sync status
 */
export async function getSyncStatusHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const client = getBedrockAgentClient();
    const knowledgeBaseId = getKnowledgeBaseId();
    const dataSourceId = getDataSourceId();

    // Get the latest ingestion job
    const response = await client.send(
      new ListIngestionJobsCommand({
        knowledgeBaseId,
        dataSourceId,
        maxResults: 1,
        sortBy: {
          attribute: 'STARTED_AT',
          order: 'DESCENDING',
        },
      })
    );

    const latestJob = response.ingestionJobSummaries?.[0];

    if (!latestJob) {
      // No jobs found
      const result: SyncJobStatus = {
        syncInProgress: false,
      };
      return createSuccessResponse(result);
    }

    const result: SyncJobStatus = {
      syncInProgress: shouldDisableButtons(latestJob.status),
      jobId: latestJob.ingestionJobId,
      status: latestJob.status,
      startedAt: latestJob.startedAt?.toISOString(),
      completedAt: latestJob.updatedAt?.toISOString(),
    };

    // Add statistics if available
    if (latestJob.statistics) {
      result.documentsProcessed = latestJob.statistics.numberOfDocumentsScanned;
      result.documentsFailed = latestJob.statistics.numberOfDocumentsFailed;
    }

    return createSuccessResponse(result);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Filters documents by file name search keyword.
 *
 * Requirement 20.21: Search documents by file name
 *
 * @param documents - Array of documents
 * @param searchKeyword - Search keyword
 * @returns Filtered documents
 */
export function filterDocumentsByName(
  documents: DocumentEntry[],
  searchKeyword: string
): DocumentEntry[] {
  if (!searchKeyword || searchKeyword.trim() === '') {
    return documents;
  }

  const lowerKeyword = searchKeyword.toLowerCase();
  return documents.filter((doc) =>
    doc.fileName.toLowerCase().includes(lowerKeyword)
  );
}

/**
 * Handler for GET /admin/rag/documents endpoint.
 *
 * Lists documents in the Knowledge Base data source S3 bucket.
 *
 * Query parameters:
 * - search: Optional file name search keyword
 * - nextToken: Pagination token from previous response
 * - limit: Number of documents per page (default: 50)
 *
 * Requirements:
 * - 20.4: Display document list from Knowledge Base data source
 * - 20.5: Display file name, size, upload date, status
 * - 20.21: Search documents by file name
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with document list
 */
export async function listDocumentsHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const client = getS3Client();
    const bucketName = getRagBucketName();

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const searchKeyword = queryParams.search || '';
    const continuationToken = queryParams.nextToken;
    const requestedLimit = parseInt(queryParams.limit || '50', 10);
    const limit = Math.min(Math.max(1, requestedLimit), 100);

    // List objects from S3
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1000, // Fetch more for client-side filtering
        ContinuationToken: continuationToken,
      })
    );

    // Convert S3 objects to document entries
    let documents: DocumentEntry[] = (response.Contents || [])
      .filter((obj) => obj.Key && obj.Size && obj.Size > 0) // Filter out folders
      .map((obj) => {
        const key = obj.Key!;
        const fileName = key.split('/').pop() || key;
        const extension = getFileExtension(fileName);

        return {
          id: encodeURIComponent(key),
          fileName,
          size: obj.Size!,
          uploadedAt:
            obj.LastModified?.toISOString() || new Date().toISOString(),
          extension,
        };
      });

    // Apply search filter
    if (searchKeyword) {
      documents = filterDocumentsByName(documents, searchKeyword);
    }

    // Apply pagination
    const paginatedDocuments = documents.slice(0, limit);

    const result: ListDocumentsResponse = {
      documents: paginatedDocuments,
      count: paginatedDocuments.length,
    };

    // Include next token if there are more results
    if (response.NextContinuationToken) {
      result.nextToken = response.NextContinuationToken;
    }

    return createSuccessResponse(result);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Handler for POST /admin/rag/documents endpoint.
 *
 * Generates a presigned URL for document upload and optionally starts sync.
 *
 * Request body:
 * - fileName: File name (required)
 * - fileSize: File size in bytes (required)
 * - contentType: Content type (optional)
 *
 * Requirements:
 * - 20.6: Show file selection dialog
 * - 20.7: Accept supported file formats
 * - 20.8: Validate text document size (max 50MB)
 * - 20.9: Validate image file size (max 3.75MB)
 * - 20.10: Save files to Bedrock Knowledge Base data source S3 bucket
 * - 20.11: Start sync using StartIngestionJob API after upload
 * - 20.18: Record audit logs for upload operations
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with presigned URL
 */
export async function uploadDocumentHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const adminUserId = getAdminUserId(event) || 'unknown';
    const adminEmail = getAdminEmail(event);

    // Parse request body
    if (!event.body) {
      return createBadRequestResponse('Request body is required');
    }

    let requestBody: UploadRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return createBadRequestResponse('Invalid JSON in request body');
    }

    // Validate required fields
    if (!requestBody.fileName) {
      return createBadRequestResponse('fileName is required');
    }

    if (!requestBody.fileSize || requestBody.fileSize <= 0) {
      return createBadRequestResponse('fileSize must be a positive number');
    }

    const { fileName, fileSize, contentType } = requestBody;

    // Validate file extension
    const extension = getFileExtension(fileName);
    if (!extension) {
      return createBadRequestResponse('File must have an extension');
    }

    if (!isSupportedExtension(extension)) {
      return createBadRequestResponse(
        `Unsupported file format. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`
      );
    }

    // Validate file size
    const sizeValidation = validateFileSize(fileSize, extension);
    if (!sizeValidation.valid) {
      return createBadRequestResponse(sizeValidation.error!);
    }

    const s3 = getS3Client();
    const bucketName = getRagBucketName();

    // Generate unique document ID (S3 key)
    const timestamp = Date.now();
    const documentId = `${timestamp}-${fileName}`;

    // Generate presigned URL for upload
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: documentId,
      ContentType: contentType,
    });

    const expiresIn = 3600; // 1 hour
    const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Record audit log
    await recordAuditLog({
      adminUserId,
      adminEmail,
      action: AuditAction.DOCUMENT_UPLOAD,
      details: {
        documentName: fileName,
        documentSize: fileSize,
        documentId,
      },
      context,
    });

    const result: UploadResponse = {
      uploadUrl,
      documentId: encodeURIComponent(documentId),
      expiresAt,
    };

    return createSuccessResponse(result, 201);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Starts a sync job for the Knowledge Base.
 *
 * Requirement 20.11: Start sync using StartIngestionJob API
 *
 * @returns Job ID of the started sync job
 */
export async function startSyncJob(): Promise<string> {
  const client = getBedrockAgentClient();
  const knowledgeBaseId = getKnowledgeBaseId();
  const dataSourceId = getDataSourceId();

  const response = await client.send(
    new StartIngestionJobCommand({
      knowledgeBaseId,
      dataSourceId,
    })
  );

  return response.ingestionJob?.ingestionJobId || '';
}

/**
 * Handler for POST /admin/rag/documents/complete endpoint.
 *
 * Called after upload is complete to start sync job.
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with sync job ID
 */
export async function completeUploadHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    // Start sync job
    const jobId = await startSyncJob();

    return createSuccessResponse({
      message: 'Sync job started',
      jobId,
    });
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Handler for DELETE /admin/rag/documents/{id} endpoint.
 *
 * Deletes a document from S3 and starts re-sync.
 *
 * Requirements:
 * - 20.16: Delete document from S3 and re-sync
 * - 20.18: Record audit logs for delete operations
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result
 */
export async function deleteDocumentHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const adminUserId = getAdminUserId(event) || 'unknown';
    const adminEmail = getAdminEmail(event);

    // Get document ID from path parameters
    const documentId = event.pathParameters?.documentId;
    if (!documentId) {
      return createBadRequestResponse('Document ID is required');
    }

    // Decode the document ID (S3 key)
    const s3Key = decodeURIComponent(documentId);

    const s3 = getS3Client();
    const bucketName = getRagBucketName();

    // Delete the document from S3
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      })
    );

    // Record audit log
    await recordAuditLog({
      adminUserId,
      adminEmail,
      action: AuditAction.DOCUMENT_DELETE,
      details: {
        documentName: s3Key,
      },
      context,
    });

    // Start re-sync
    const jobId = await startSyncJob();

    return createSuccessResponse({
      message: 'Document deleted and sync started',
      documentId,
      syncJobId: jobId,
    });
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Handler for GET /admin/rag/documents/{id}/download endpoint.
 *
 * Generates a presigned URL for document download.
 *
 * Requirement 20.17: Download document from S3
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with download URL
 */
export async function downloadDocumentHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    // Get document ID from path parameters
    const documentId = event.pathParameters?.documentId;
    if (!documentId) {
      return createBadRequestResponse('Document ID is required');
    }

    // Decode the document ID (S3 key)
    const s3Key = decodeURIComponent(documentId);

    const s3 = getS3Client();
    const bucketName = getRagBucketName();

    // Check if the document exists
    try {
      await s3.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
        })
      );
    } catch (error) {
      if ((error as Error).name === 'NoSuchKey') {
        return createNotFoundResponse('Document not found');
      }
      throw error;
    }

    // Generate presigned URL for download
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });

    const expiresIn = 3600; // 1 hour
    const downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return createSuccessResponse({
      downloadUrl,
      documentId,
      expiresAt,
    });
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Allows setting a custom S3 client for testing purposes.
 *
 * @param client - S3 client to use
 */
export function setS3Client(client: S3Client): void {
  s3Client = client;
}

/**
 * Resets the S3 client (useful for testing).
 */
export function resetS3Client(): void {
  s3Client = null;
}

/**
 * Allows setting a custom Bedrock Agent client for testing purposes.
 *
 * @param client - Bedrock Agent client to use
 */
export function setBedrockAgentClient(client: BedrockAgentClient): void {
  bedrockAgentClient = client;
}

/**
 * Resets the Bedrock Agent client (useful for testing).
 */
export function resetBedrockAgentClient(): void {
  bedrockAgentClient = null;
}
