/**
 * Unit tests for RAG document management Lambda handler.
 *
 * Tests cover:
 * - File extension validation
 * - File size validation
 * - Sync job status determination
 * - Document filtering by name
 * - Handler integration tests
 *
 * Requirements:
 * - 20.1: Check current sync job status
 * - 20.4: Display document list
 * - 20.5: Display file name, size, upload date, status
 * - 20.7: Accept supported file formats
 * - 20.8: Validate text document size (max 50MB)
 * - 20.9: Validate image file size (max 3.75MB)
 * - 20.21: Search documents by file name
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BedrockAgentClient,
  ListIngestionJobsCommand,
  StartIngestionJobCommand,
} from '@aws-sdk/client-bedrock-agent';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  getFileExtension,
  isSupportedExtension,
  isTextDocument,
  isImageFile,
  validateFileSize,
  shouldDisableButtons,
  filterDocumentsByName,
  getSyncStatusHandler,
  listDocumentsHandler,
  uploadDocumentHandler,
  deleteDocumentHandler,
  downloadDocumentHandler,
  resetS3Client,
  resetBedrockAgentClient,
  TEXT_DOCUMENT_EXTENSIONS,
  IMAGE_FILE_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
  MAX_TEXT_DOCUMENT_SIZE,
  MAX_IMAGE_FILE_SIZE,
  DocumentEntry,
} from '../../../../lambda/admin/handlers/rag';
import { resetDynamoDbClient as resetAuditDynamoDbClient } from '../../../../lambda/admin/utils/auditLog';

const s3Mock = mockClient(S3Client);
const bedrockAgentMock = mockClient(BedrockAgentClient);
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('File Extension Utilities', () => {
  describe('getFileExtension', () => {
    it('should extract extension from file name', () => {
      expect(getFileExtension('document.pdf')).toBe('.pdf');
      expect(getFileExtension('image.PNG')).toBe('.png');
      expect(getFileExtension('file.name.txt')).toBe('.txt');
    });

    it('should return empty string for files without extension', () => {
      expect(getFileExtension('noextension')).toBe('');
      expect(getFileExtension('')).toBe('');
    });

    it('should handle edge cases', () => {
      expect(getFileExtension('.hidden')).toBe('.hidden');
      expect(getFileExtension('file.')).toBe('.');
    });
  });

  describe('isSupportedExtension', () => {
    it('should return true for supported text document extensions', () => {
      TEXT_DOCUMENT_EXTENSIONS.forEach((ext) => {
        expect(isSupportedExtension(ext)).toBe(true);
        expect(isSupportedExtension(ext.toUpperCase())).toBe(true);
      });
    });

    it('should return true for supported image extensions', () => {
      IMAGE_FILE_EXTENSIONS.forEach((ext) => {
        expect(isSupportedExtension(ext)).toBe(true);
        expect(isSupportedExtension(ext.toUpperCase())).toBe(true);
      });
    });

    it('should return false for unsupported extensions', () => {
      expect(isSupportedExtension('.exe')).toBe(false);
      expect(isSupportedExtension('.zip')).toBe(false);
      expect(isSupportedExtension('.mp4')).toBe(false);
      expect(isSupportedExtension('')).toBe(false);
    });
  });

  describe('isTextDocument', () => {
    it('should return true for text document extensions', () => {
      expect(isTextDocument('.txt')).toBe(true);
      expect(isTextDocument('.pdf')).toBe(true);
      expect(isTextDocument('.docx')).toBe(true);
      expect(isTextDocument('.md')).toBe(true);
      expect(isTextDocument('.html')).toBe(true);
      expect(isTextDocument('.csv')).toBe(true);
      expect(isTextDocument('.xlsx')).toBe(true);
    });

    it('should return false for image extensions', () => {
      expect(isTextDocument('.jpeg')).toBe(false);
      expect(isTextDocument('.png')).toBe(false);
    });
  });

  describe('isImageFile', () => {
    it('should return true for image extensions', () => {
      expect(isImageFile('.jpeg')).toBe(true);
      expect(isImageFile('.jpg')).toBe(true);
      expect(isImageFile('.png')).toBe(true);
    });

    it('should return false for text document extensions', () => {
      expect(isImageFile('.pdf')).toBe(false);
      expect(isImageFile('.txt')).toBe(false);
    });
  });
});

describe('File Size Validation', () => {
  describe('validateFileSize', () => {
    it('should accept valid text document sizes', () => {
      // Requirement 20.8: Validate text document size (max 50MB)
      const result = validateFileSize(1024, '.pdf');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject text documents exceeding 50MB', () => {
      // Requirement 20.8: Validate text document size (max 50MB)
      const result = validateFileSize(MAX_TEXT_DOCUMENT_SIZE + 1, '.pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50MB');
      expect(result.maxSize).toBe(MAX_TEXT_DOCUMENT_SIZE);
    });

    it('should accept valid image file sizes', () => {
      // Requirement 20.9: Validate image file size (max 3.75MB)
      const result = validateFileSize(1024 * 1024, '.jpeg');
      expect(result.valid).toBe(true);
    });

    it('should reject image files exceeding 3.75MB', () => {
      // Requirement 20.9: Validate image file size (max 3.75MB)
      const result = validateFileSize(MAX_IMAGE_FILE_SIZE + 1, '.png');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('3.75MB');
      expect(result.maxSize).toBe(MAX_IMAGE_FILE_SIZE);
    });

    it('should reject zero or negative file sizes', () => {
      expect(validateFileSize(0, '.pdf').valid).toBe(false);
      expect(validateFileSize(-1, '.pdf').valid).toBe(false);
    });

    it('should accept files at exactly the maximum size', () => {
      expect(validateFileSize(MAX_TEXT_DOCUMENT_SIZE, '.pdf').valid).toBe(true);
      expect(validateFileSize(MAX_IMAGE_FILE_SIZE, '.jpeg').valid).toBe(true);
    });
  });
});

describe('Sync Job Status', () => {
  describe('shouldDisableButtons', () => {
    it('should return true for IN_PROGRESS status', () => {
      // Property 17: Sync job UI state management
      expect(shouldDisableButtons('IN_PROGRESS')).toBe(true);
    });

    it('should return true for STARTING status', () => {
      expect(shouldDisableButtons('STARTING')).toBe(true);
    });

    it('should return false for COMPLETE status', () => {
      expect(shouldDisableButtons('COMPLETE')).toBe(false);
    });

    it('should return false for FAILED status', () => {
      expect(shouldDisableButtons('FAILED')).toBe(false);
    });

    it('should return false for undefined status', () => {
      expect(shouldDisableButtons(undefined)).toBe(false);
    });

    it('should return false for empty string status', () => {
      expect(shouldDisableButtons('')).toBe(false);
    });
  });
});

describe('Document Filtering', () => {
  const sampleDocuments: DocumentEntry[] = [
    {
      id: 'doc1',
      fileName: 'report-2025.pdf',
      size: 1024,
      uploadedAt: '2025-01-22T10:00:00Z',
      extension: '.pdf',
    },
    {
      id: 'doc2',
      fileName: 'image-photo.jpeg',
      size: 2048,
      uploadedAt: '2025-01-22T11:00:00Z',
      extension: '.jpeg',
    },
    {
      id: 'doc3',
      fileName: 'data-export.csv',
      size: 512,
      uploadedAt: '2025-01-22T12:00:00Z',
      extension: '.csv',
    },
  ];

  describe('filterDocumentsByName', () => {
    it('should filter documents by partial file name match', () => {
      // Requirement 20.21: Search documents by file name
      const result = filterDocumentsByName(sampleDocuments, 'report');
      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('report-2025.pdf');
    });

    it('should be case-insensitive', () => {
      const result = filterDocumentsByName(sampleDocuments, 'REPORT');
      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('report-2025.pdf');
    });

    it('should return all documents for empty search keyword', () => {
      expect(filterDocumentsByName(sampleDocuments, '')).toHaveLength(3);
      expect(filterDocumentsByName(sampleDocuments, '   ')).toHaveLength(3);
    });

    it('should return empty array when no matches found', () => {
      const result = filterDocumentsByName(sampleDocuments, 'nonexistent');
      expect(result).toHaveLength(0);
    });

    it('should match multiple documents', () => {
      const result = filterDocumentsByName(sampleDocuments, '-');
      expect(result).toHaveLength(3); // All have '-' in the name
    });
  });
});

describe('Handler Integration Tests', () => {
  beforeEach(() => {
    s3Mock.reset();
    bedrockAgentMock.reset();
    ddbMock.reset();
    resetS3Client();
    resetBedrockAgentClient();
    resetAuditDynamoDbClient();
    process.env.RAG_BUCKET_NAME = 'test-rag-bucket';
    process.env.KNOWLEDGE_BASE_ID = 'test-kb-id';
    process.env.DATA_SOURCE_ID = 'test-ds-id';
    process.env.TABLE_NAME = 'test-table';

    // Mock DynamoDB for audit logging
    ddbMock.on(PutCommand).resolves({});
  });

  afterEach(() => {
    delete process.env.RAG_BUCKET_NAME;
    delete process.env.KNOWLEDGE_BASE_ID;
    delete process.env.DATA_SOURCE_ID;
    delete process.env.TABLE_NAME;
  });

  const mockAdminEvent = {
    requestContext: {
      authorizer: {
        claims: {
          'custom:role': 'admin',
          'cognito:username': 'admin-user-123',
          email: 'admin@example.com',
        },
      },
    },
    queryStringParameters: {},
    pathParameters: {},
    body: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const mockNonAdminEvent = {
    ...mockAdminEvent,
    requestContext: {
      authorizer: {
        claims: {
          'cognito:username': 'user-123',
        },
      },
    },
  };

  const mockContext = {
    awsRequestId: 'test-request-id',
  } as Context;

  describe('getSyncStatusHandler', () => {
    it('should return sync status when job exists', async () => {
      bedrockAgentMock.on(ListIngestionJobsCommand).resolves({
        ingestionJobSummaries: [
          {
            ingestionJobId: 'job-123',
            knowledgeBaseId: 'test-kb-id',
            dataSourceId: 'test-ds-id',
            status: 'COMPLETE',
            startedAt: new Date('2025-01-22T10:00:00Z'),
            updatedAt: new Date('2025-01-22T10:30:00Z'),
            statistics: {
              numberOfDocumentsScanned: 10,
              numberOfDocumentsFailed: 0,
            },
          },
        ],
      });

      const result = await getSyncStatusHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.syncInProgress).toBe(false);
      expect(body.jobId).toBe('job-123');
      expect(body.status).toBe('COMPLETE');
      expect(body.documentsProcessed).toBe(10);
    });

    it('should return syncInProgress=true when job is in progress', async () => {
      bedrockAgentMock.on(ListIngestionJobsCommand).resolves({
        ingestionJobSummaries: [
          {
            ingestionJobId: 'job-456',
            knowledgeBaseId: 'test-kb-id',
            dataSourceId: 'test-ds-id',
            status: 'IN_PROGRESS',
            startedAt: new Date('2025-01-22T10:00:00Z'),
            updatedAt: new Date('2025-01-22T10:00:00Z'),
          },
        ],
      });

      const result = await getSyncStatusHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.syncInProgress).toBe(true);
    });

    it('should return syncInProgress=false when no jobs exist', async () => {
      bedrockAgentMock.on(ListIngestionJobsCommand).resolves({
        ingestionJobSummaries: [],
      });

      const result = await getSyncStatusHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.syncInProgress).toBe(false);
      expect(body.jobId).toBeUndefined();
    });

    it('should return 403 for non-admin user', async () => {
      const result = await getSyncStatusHandler(mockNonAdminEvent, mockContext);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('listDocumentsHandler', () => {
    it('should return document list', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          {
            Key: 'document1.pdf',
            Size: 1024,
            LastModified: new Date('2025-01-22T10:00:00Z'),
          },
          {
            Key: 'image.jpeg',
            Size: 2048,
            LastModified: new Date('2025-01-22T11:00:00Z'),
          },
        ],
      });

      const result = await listDocumentsHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.documents).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.documents[0].fileName).toBe('document1.pdf');
      expect(body.documents[0].extension).toBe('.pdf');
    });

    it('should filter documents by search keyword', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          {
            Key: 'report-2025.pdf',
            Size: 1024,
            LastModified: new Date('2025-01-22T10:00:00Z'),
          },
          {
            Key: 'image.jpeg',
            Size: 2048,
            LastModified: new Date('2025-01-22T11:00:00Z'),
          },
        ],
      });

      const eventWithSearch = {
        ...mockAdminEvent,
        queryStringParameters: { search: 'report' },
      };

      const result = await listDocumentsHandler(eventWithSearch, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.documents).toHaveLength(1);
      expect(body.documents[0].fileName).toBe('report-2025.pdf');
    });

    it('should return 403 for non-admin user', async () => {
      const result = await listDocumentsHandler(mockNonAdminEvent, mockContext);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('uploadDocumentHandler', () => {
    it('should generate presigned URL for valid upload request', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'document.pdf',
          fileSize: 1024,
          contentType: 'application/pdf',
        }),
      };

      const result = await uploadDocumentHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.uploadUrl).toBeDefined();
      expect(body.documentId).toBeDefined();
      expect(body.expiresAt).toBeDefined();
    });

    it('should reject unsupported file format', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'malware.exe',
          fileSize: 1024,
        }),
      };

      const result = await uploadDocumentHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Unsupported file format');
    });

    it('should reject text document exceeding 50MB', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'large-document.pdf',
          fileSize: MAX_TEXT_DOCUMENT_SIZE + 1,
        }),
      };

      const result = await uploadDocumentHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('50MB');
    });

    it('should reject image file exceeding 3.75MB', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'large-image.jpeg',
          fileSize: MAX_IMAGE_FILE_SIZE + 1,
        }),
      };

      const result = await uploadDocumentHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('3.75MB');
    });

    it('should reject missing fileName', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileSize: 1024,
        }),
      };

      const result = await uploadDocumentHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('fileName');
    });

    it('should reject missing fileSize', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'document.pdf',
        }),
      };

      const result = await uploadDocumentHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('fileSize');
    });

    it('should return 403 for non-admin user', async () => {
      const eventWithBody = {
        ...mockNonAdminEvent,
        body: JSON.stringify({
          fileName: 'document.pdf',
          fileSize: 1024,
        }),
      };

      const result = await uploadDocumentHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('deleteDocumentHandler', () => {
    it('should delete document and start sync', async () => {
      s3Mock.on(DeleteObjectCommand).resolves({});
      bedrockAgentMock.on(StartIngestionJobCommand).resolves({
        ingestionJob: {
          ingestionJobId: 'sync-job-123',
          knowledgeBaseId: 'test-kb-id',
          dataSourceId: 'test-ds-id',
          status: 'STARTING',
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const eventWithPath = {
        ...mockAdminEvent,
        pathParameters: { documentId: encodeURIComponent('document.pdf') },
      };

      const result = await deleteDocumentHandler(eventWithPath, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('deleted');
      expect(body.syncJobId).toBe('sync-job-123');
    });

    it('should reject missing document ID', async () => {
      const result = await deleteDocumentHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Document ID');
    });

    it('should return 403 for non-admin user', async () => {
      const eventWithPath = {
        ...mockNonAdminEvent,
        pathParameters: { documentId: 'document.pdf' },
      };

      const result = await deleteDocumentHandler(eventWithPath, mockContext);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('downloadDocumentHandler', () => {
    it('should generate presigned URL for download', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: undefined,
      });

      const eventWithPath = {
        ...mockAdminEvent,
        pathParameters: { documentId: encodeURIComponent('document.pdf') },
      };

      const result = await downloadDocumentHandler(eventWithPath, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.downloadUrl).toBeDefined();
      expect(body.expiresAt).toBeDefined();
    });

    it('should reject missing document ID', async () => {
      const result = await downloadDocumentHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Document ID');
    });

    it('should return 403 for non-admin user', async () => {
      const eventWithPath = {
        ...mockNonAdminEvent,
        pathParameters: { documentId: 'document.pdf' },
      };

      const result = await downloadDocumentHandler(eventWithPath, mockContext);
      expect(result.statusCode).toBe(403);
    });
  });
});

describe('Constants', () => {
  it('should have correct text document extensions', () => {
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.txt');
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.md');
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.html');
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.doc');
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.docx');
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.csv');
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.xls');
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.xlsx');
    expect(TEXT_DOCUMENT_EXTENSIONS).toContain('.pdf');
  });

  it('should have correct image file extensions', () => {
    expect(IMAGE_FILE_EXTENSIONS).toContain('.jpeg');
    expect(IMAGE_FILE_EXTENSIONS).toContain('.jpg');
    expect(IMAGE_FILE_EXTENSIONS).toContain('.png');
  });

  it('should have all supported extensions', () => {
    expect(SUPPORTED_EXTENSIONS).toEqual([
      ...TEXT_DOCUMENT_EXTENSIONS,
      ...IMAGE_FILE_EXTENSIONS,
    ]);
  });

  it('should have correct max file sizes', () => {
    expect(MAX_TEXT_DOCUMENT_SIZE).toBe(50 * 1024 * 1024); // 50MB
    expect(MAX_IMAGE_FILE_SIZE).toBe(3.75 * 1024 * 1024); // 3.75MB
  });
});
