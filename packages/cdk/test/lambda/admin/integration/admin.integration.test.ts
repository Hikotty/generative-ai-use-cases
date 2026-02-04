/**
 * Integration tests for admin dashboard functionality.
 *
 * These tests verify the complete flow of operations across multiple handlers,
 * testing the integration between different Lambda functions and AWS services.
 *
 * Test scenarios:
 * 1. User management flow: create user → list users → update user (grant admin) → delete user
 * 2. Log viewer flow: list logs with date filter → list logs with user filter → export logs
 * 3. RAG document flow: upload document → check sync status → delete document
 *
 * Requirements: All requirements (integration testing)
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  UserStatusType,
  UsernameExistsException,
  AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, ScanCommand as DDBScanCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BedrockAgentClient,
  ListIngestionJobsCommand,
  StartIngestionJobCommand,
  IngestionJobStatus,
} from '@aws-sdk/client-bedrock-agent';
import { mockClient } from 'aws-sdk-client-mock';

// Import handlers
import {
  listUsersHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  resetCognitoClient,
} from '../../../../lambda/admin/handlers/users';
import {
  listLogsHandler,
  exportLogsHandler,
  resetDynamoDbClient as resetLogsDynamoDbClient,
} from '../../../../lambda/admin/handlers/logs';
import {
  getSyncStatusHandler,
  listDocumentsHandler,
  uploadDocumentHandler,
  deleteDocumentHandler,
  resetS3Client,
  resetBedrockAgentClient,
} from '../../../../lambda/admin/handlers/rag';
import { resetDynamoDbClient as resetAuditDynamoDbClient } from '../../../../lambda/admin/utils/auditLog';

// Mock AWS clients
const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dynamoDbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const bedrockAgentMock = mockClient(BedrockAgentClient);

/**
 * Helper function to create a mock APIGatewayProxyEvent with admin claims.
 */
function createAdminEvent(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    pathParameters?: Record<string, string>;
    queryStringParameters?: Record<string, string>;
  }
): APIGatewayProxyEvent {
  return {
    body: options?.body ? JSON.stringify(options.body) : null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: method,
    isBase64Encoded: false,
    path,
    pathParameters: options?.pathParameters || null,
    queryStringParameters: options?.queryStringParameters || null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api-id',
      authorizer: {
        claims: {
          'cognito:username': 'admin-user-id',
          email: 'admin@example.com',
          'custom:role': 'admin',
        },
      },
      protocol: 'HTTP/1.1',
      httpMethod: method,
      identity: {
        accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
        caller: null, clientCert: null, cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null, cognitoIdentityId: null,
        cognitoIdentityPoolId: null, principalOrgId: null,
        sourceIp: '127.0.0.1', user: null, userAgent: 'test-agent', userArn: null,
      },
      path, stage: 'test', requestId: 'test-request-id',
      requestTimeEpoch: Date.now(), resourceId: 'test-resource-id', resourcePath: path,
    },
  } as APIGatewayProxyEvent;
}

function createMockContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false, functionName: 'test-function',
    functionVersion: '1', invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
    memoryLimitInMB: '128', awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test', logStreamName: '2025/01/01/[$LATEST]test',
    getRemainingTimeInMillis: () => 30000, done: () => {}, fail: () => {}, succeed: () => {},
  };
}


describe('Admin Dashboard Integration Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    cognitoMock.reset();
    dynamoDbMock.reset();
    s3Mock.reset();
    bedrockAgentMock.reset();
    resetCognitoClient();
    resetLogsDynamoDbClient();
    resetAuditDynamoDbClient();
    resetS3Client();
    resetBedrockAgentClient();

    process.env = {
      ...originalEnv,
      USER_POOL_ID: 'test-user-pool-id',
      TABLE_NAME: 'test-table',
      MAIN_TABLE_NAME: 'test-main-table',
      RAG_BUCKET_NAME: 'test-rag-bucket',
      KNOWLEDGE_BASE_ID: 'test-kb-id',
      DATA_SOURCE_ID: 'test-ds-id',
    };
    dynamoDbMock.on(PutCommand).resolves({});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /**
   * Integration Test: User Management Flow
   * Tests: create user → list users → update user (grant admin) → delete user
   * Requirements: 3.1-3.9, 5.1-5.5
   */
  describe('User Management Flow', () => {
    const testUserEmail = 'newuser@example.com';

    it('should complete the full user management flow: create → list → grant admin → delete', async () => {
      const context = createMockContext();
      const createdUsers: Array<{
        Username: string;
        Attributes: AttributeType[];
        Enabled: boolean;
        UserCreateDate: Date;
        UserStatus: UserStatusType;
      }> = [];

      // Step 1: Create a new user
      cognitoMock.on(AdminCreateUserCommand).callsFake((input) => {
        const newUser = {
          Username: input.Username,
          Attributes: input.UserAttributes || [],
          Enabled: true,
          UserCreateDate: new Date(),
          UserStatus: 'CONFIRMED' as UserStatusType,
        };
        createdUsers.push(newUser);
        return { User: newUser };
      });

      const createEvent = createAdminEvent('POST', '/admin/users', {
        body: { email: testUserEmail, isAdmin: false },
      });
      const createResult = await createUserHandler(createEvent, context);
      expect(createResult.statusCode).toBe(201);
      const createBody = JSON.parse(createResult.body);
      expect(createBody.user.email).toBe(testUserEmail);
      expect(createBody.user.isAdmin).toBe(false);

      // Step 2: List users and verify the new user appears
      cognitoMock.on(ListUsersCommand).resolves({
        Users: createdUsers.map((u) => ({ ...u, UserLastModifiedDate: u.UserCreateDate })),
      });
      const listEvent = createAdminEvent('GET', '/admin/users');
      const listResult = await listUsersHandler(listEvent, context);
      expect(listResult.statusCode).toBe(200);
      const listBody = JSON.parse(listResult.body);
      expect(listBody.users.length).toBeGreaterThan(0);
      const foundUser = listBody.users.find((u: { email: string }) => u.email === testUserEmail);
      expect(foundUser).toBeDefined();
      expect(foundUser.isAdmin).toBe(false);

      // Step 3: Grant admin role to the user
      cognitoMock.on(AdminUpdateUserAttributesCommand).callsFake((input) => {
        const user = createdUsers.find((u) => u.Username === input.Username);
        if (user && input.UserAttributes) {
          const roleAttr = input.UserAttributes.find((attr: AttributeType) => attr.Name === 'custom:role');
          if (roleAttr) {
            const existingIdx = user.Attributes.findIndex((attr: AttributeType) => attr.Name === 'custom:role');
            if (existingIdx >= 0) {
              user.Attributes[existingIdx] = { Name: 'custom:role', Value: roleAttr.Value || '' };
            } else {
              user.Attributes.push({ Name: 'custom:role', Value: roleAttr.Value || '' });
            }
          }
        }
        return {};
      });

      const updateEvent = createAdminEvent('PUT', `/admin/users/${testUserEmail}`, {
        pathParameters: { userId: testUserEmail },
        body: { isAdmin: true },
      });
      const updateResult = await updateUserHandler(updateEvent, context);
      expect(updateResult.statusCode).toBe(200);

      // Verify admin role was granted
      cognitoMock.on(ListUsersCommand).resolves({
        Users: createdUsers.map((u) => ({ ...u, UserLastModifiedDate: u.UserCreateDate })),
      });
      const listAfterUpdateResult = await listUsersHandler(createAdminEvent('GET', '/admin/users'), context);
      expect(listAfterUpdateResult.statusCode).toBe(200);
      const listAfterUpdateBody = JSON.parse(listAfterUpdateResult.body);
      const updatedUser = listAfterUpdateBody.users.find((u: { email: string }) => u.email === testUserEmail);
      expect(updatedUser).toBeDefined();
      expect(updatedUser.isAdmin).toBe(true);

      // Step 4: Delete the user
      cognitoMock.on(AdminDeleteUserCommand).callsFake((input) => {
        const index = createdUsers.findIndex((u) => u.Username === input.Username);
        if (index >= 0) createdUsers.splice(index, 1);
        return {};
      });
      const deleteEvent = createAdminEvent('DELETE', `/admin/users/${testUserEmail}`, {
        pathParameters: { userId: testUserEmail },
      });
      const deleteResult = await deleteUserHandler(deleteEvent, context);
      expect(deleteResult.statusCode).toBe(200);

      // Verify user was deleted
      cognitoMock.on(ListUsersCommand).resolves({
        Users: createdUsers.map((u) => ({ ...u, UserLastModifiedDate: u.UserCreateDate })),
      });
      const listAfterDeleteResult = await listUsersHandler(createAdminEvent('GET', '/admin/users'), context);
      expect(listAfterDeleteResult.statusCode).toBe(200);
      const listAfterDeleteBody = JSON.parse(listAfterDeleteResult.body);
      const deletedUser = listAfterDeleteBody.users.find((u: { email: string }) => u.email === testUserEmail);
      expect(deletedUser).toBeUndefined();
    });


    it('should handle user enable/disable flow', async () => {
      const context = createMockContext();
      const testUser = {
        Username: 'test-user@example.com',
        Attributes: [
          { Name: 'email', Value: 'test-user@example.com' },
          { Name: 'email_verified', Value: 'true' },
        ],
        Enabled: true,
        UserCreateDate: new Date(),
        UserStatus: 'CONFIRMED' as UserStatusType,
      };

      cognitoMock.on(ListUsersCommand).resolves({
        Users: [{ ...testUser, UserLastModifiedDate: testUser.UserCreateDate }],
      });

      // Verify user is initially active
      const listResult = await listUsersHandler(createAdminEvent('GET', '/admin/users'), context);
      expect(listResult.statusCode).toBe(200);
      expect(JSON.parse(listResult.body).users[0].status).toBe('active');

      // Disable the user
      cognitoMock.on(AdminDisableUserCommand).callsFake(() => {
        testUser.Enabled = false;
        return {};
      });
      const disableEvent = createAdminEvent('PUT', `/admin/users/${testUser.Username}`, {
        pathParameters: { userId: testUser.Username },
        body: { enabled: false },
      });
      const disableResult = await updateUserHandler(disableEvent, context);
      expect(disableResult.statusCode).toBe(200);

      // Verify user is now disabled
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [{ ...testUser, UserLastModifiedDate: testUser.UserCreateDate }],
      });
      const listAfterDisableResult = await listUsersHandler(createAdminEvent('GET', '/admin/users'), context);
      expect(JSON.parse(listAfterDisableResult.body).users[0].status).toBe('disabled');

      // Re-enable the user
      cognitoMock.on(AdminEnableUserCommand).callsFake(() => {
        testUser.Enabled = true;
        return {};
      });
      const enableEvent = createAdminEvent('PUT', `/admin/users/${testUser.Username}`, {
        pathParameters: { userId: testUser.Username },
        body: { enabled: true },
      });
      const enableResult = await updateUserHandler(enableEvent, context);
      expect(enableResult.statusCode).toBe(200);

      // Verify user is active again
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [{ ...testUser, UserLastModifiedDate: testUser.UserCreateDate }],
      });
      const listAfterEnableResult = await listUsersHandler(createAdminEvent('GET', '/admin/users'), context);
      expect(JSON.parse(listAfterEnableResult.body).users[0].status).toBe('active');
    });

    it('should handle duplicate user creation gracefully', async () => {
      const context = createMockContext();

      // First creation succeeds
      cognitoMock.on(AdminCreateUserCommand).resolvesOnce({
        User: {
          Username: testUserEmail,
          Attributes: [{ Name: 'email', Value: testUserEmail }],
          Enabled: true,
          UserCreateDate: new Date(),
          UserStatus: 'CONFIRMED' as UserStatusType,
        },
      });
      const createResult1 = await createUserHandler(
        createAdminEvent('POST', '/admin/users', { body: { email: testUserEmail, isAdmin: false } }),
        context
      );
      expect(createResult1.statusCode).toBe(201);

      // Second creation fails with UsernameExistsException
      cognitoMock.on(AdminCreateUserCommand).rejects(
        new UsernameExistsException({ message: 'User already exists', $metadata: {} })
      );
      const createResult2 = await createUserHandler(
        createAdminEvent('POST', '/admin/users', { body: { email: testUserEmail, isAdmin: false } }),
        context
      );
      expect(createResult2.statusCode).toBe(400);
      expect(JSON.parse(createResult2.body).error).toContain('already exists');
    });
  });


  /**
   * Integration Test: Log Viewer Flow
   * Tests: list logs with date filter → list logs with user filter → export logs
   * Requirements: 4.1-4.6
   */
  describe('Log Viewer Flow', () => {
    const mockLogs = [
      {
        id: 'chat#chat-1', createdDate: `${Date.now() - 86400000}#uuid-1`,
        messageId: 'msg-1', role: 'user', content: 'Hello, test message from user 1',
        userId: 'user#user-1', llmType: 'claude-3-sonnet', usecase: 'chat',
      },
      {
        id: 'chat#chat-1', createdDate: `${Date.now() - 86400000 + 1000}#uuid-2`,
        messageId: 'msg-2', role: 'assistant', content: 'Hello! How can I help you?',
        userId: 'user#user-1', llmType: 'claude-3-sonnet', usecase: 'chat',
      },
      {
        id: 'chat#chat-2', createdDate: `${Date.now() - 172800000}#uuid-3`,
        messageId: 'msg-3', role: 'user', content: 'Another test message from user 2',
        userId: 'user#user-2', llmType: 'claude-3-haiku', usecase: 'rag',
      },
      {
        id: 'chat#chat-3', createdDate: `${Date.now()}#uuid-4`,
        messageId: 'msg-4', role: 'user', content: 'Recent message from user 1',
        userId: 'user#user-1', llmType: 'claude-3-sonnet', usecase: 'chat',
      },
    ];

    it('should list logs and apply date filtering', async () => {
      const context = createMockContext();
      dynamoDbMock.on(ScanCommand).resolves({ Items: mockLogs });

      // List all logs
      const listAllResult = await listLogsHandler(createAdminEvent('GET', '/admin/logs'), context);
      expect(listAllResult.statusCode).toBe(200);
      expect(JSON.parse(listAllResult.body).logs.length).toBeGreaterThan(0);

      // List logs with date filter (today only)
      const today = new Date().toISOString().split('T')[0];
      const listFilteredEvent = createAdminEvent('GET', '/admin/logs', {
        queryStringParameters: { startDate: today, endDate: today },
      });
      const listFilteredResult = await listLogsHandler(listFilteredEvent, context);
      expect(listFilteredResult.statusCode).toBe(200);
      const listFilteredBody = JSON.parse(listFilteredResult.body);
      listFilteredBody.logs.forEach((log: { timestamp: string }) => {
        const logDate = new Date(log.timestamp).toISOString().split('T')[0];
        expect(logDate).toBe(today);
      });
    });

    it('should list logs and apply user filtering', async () => {
      const context = createMockContext();
      // Reset the mock to ensure clean state
      dynamoDbMock.reset();
      dynamoDbMock.on(PutCommand).resolves({});
      
      // Only return logs for user-1 to simulate server-side filtering
      const user1Logs = mockLogs.filter((log) => log.userId.includes('user-1'));
      dynamoDbMock.on(ScanCommand).resolves({ Items: user1Logs });

      const listUserFilteredEvent = createAdminEvent('GET', '/admin/logs', {
        queryStringParameters: { userId: 'user-1' },
      });
      const listUserFilteredResult = await listLogsHandler(listUserFilteredEvent, context);
      expect(listUserFilteredResult.statusCode).toBe(200);
      const listUserFilteredBody = JSON.parse(listUserFilteredResult.body);
      expect(listUserFilteredBody.logs.length).toBeGreaterThan(0);
      listUserFilteredBody.logs.forEach((log: { userId: string }) => {
        expect(log.userId).toContain('user-1');
      });
    });

    it('should export logs as CSV with filters applied', async () => {
      const context = createMockContext();
      dynamoDbMock.on(ScanCommand).resolves({ Items: mockLogs });

      // Export logs
      const exportResult = await exportLogsHandler(createAdminEvent('GET', '/admin/logs/export'), context);
      expect(exportResult.statusCode).toBe(200);
      expect(exportResult.headers?.['Content-Type']).toContain('text/csv');
      expect(exportResult.headers?.['Content-Disposition']).toContain('attachment');
      expect(exportResult.body).toContain('\uFEFF'); // UTF-8 BOM
      expect(exportResult.body).toContain('timestamp,userId,prompt,response');

      // Export with user filter
      const exportFilteredEvent = createAdminEvent('GET', '/admin/logs/export', {
        queryStringParameters: { userId: 'user-2' },
      });
      const exportFilteredResult = await exportLogsHandler(exportFilteredEvent, context);
      expect(exportFilteredResult.statusCode).toBe(200);
      expect(exportFilteredResult.body).toContain('user-2');
    });

    it('should handle pagination for large log sets', async () => {
      const context = createMockContext();
      const largeMockLogs = Array.from({ length: 150 }, (_, i) => ({
        id: `chat#chat-${i}`, createdDate: `${Date.now() - i * 1000}#uuid-${i}`,
        messageId: `msg-${i}`, role: 'user', content: `Test message ${i}`,
        userId: `user#user-${i % 5}`, llmType: 'claude-3-sonnet', usecase: 'chat',
      }));

      dynamoDbMock.on(ScanCommand).resolvesOnce({
        Items: largeMockLogs.slice(0, 100),
        LastEvaluatedKey: { id: 'chat#chat-99', createdDate: 'timestamp' },
      });

      const listEvent = createAdminEvent('GET', '/admin/logs', {
        queryStringParameters: { limit: '100' },
      });
      const listResult = await listLogsHandler(listEvent, context);
      expect(listResult.statusCode).toBe(200);
      const listBody = JSON.parse(listResult.body);
      expect(listBody.logs.length).toBeLessThanOrEqual(100);
      expect(listBody.nextToken).toBeDefined();
    });
  });


  /**
   * Integration Test: RAG Document Management Flow
   * Tests: upload document → check sync status → list documents → delete document
   * Requirements: 20.1-20.24
   */
  describe('RAG Document Management Flow', () => {
    const testDocumentName = 'test-document.pdf';
    const testDocumentSize = 1024 * 1024; // 1MB

    it('should complete the full RAG document flow: upload → sync → list → delete', async () => {
      const context = createMockContext();
      const uploadedDocuments: Array<{ Key: string; Size: number; LastModified: Date }> = [];

      // Step 1: Check initial sync status (should be idle)
      bedrockAgentMock.on(ListIngestionJobsCommand).resolvesOnce({ ingestionJobSummaries: [] });
      const syncStatusResult1 = await getSyncStatusHandler(
        createAdminEvent('GET', '/admin/rag/sync-status'), context
      );
      expect(syncStatusResult1.statusCode).toBe(200);
      expect(JSON.parse(syncStatusResult1.body).syncInProgress).toBe(false);

      // Step 2: Upload a document (get presigned URL)
      const uploadEvent = createAdminEvent('POST', '/admin/rag/documents', {
        body: { fileName: testDocumentName, fileSize: testDocumentSize, contentType: 'application/pdf' },
      });
      const uploadResult = await uploadDocumentHandler(uploadEvent, context);
      expect(uploadResult.statusCode).toBe(201);
      const uploadBody = JSON.parse(uploadResult.body);
      expect(uploadBody.uploadUrl).toBeDefined();
      expect(uploadBody.documentId).toBeDefined();

      // Simulate document being uploaded to S3
      uploadedDocuments.push({
        Key: decodeURIComponent(uploadBody.documentId),
        Size: testDocumentSize,
        LastModified: new Date(),
      });

      // Step 3: Check sync status (simulate in progress)
      // Reset and set up new mock for this call
      bedrockAgentMock.reset();
      bedrockAgentMock.on(ListIngestionJobsCommand).resolves({
        ingestionJobSummaries: [{
          ingestionJobId: 'job-123',
          knowledgeBaseId: 'test-kb-id',
          dataSourceId: 'test-ds-id',
          status: IngestionJobStatus.IN_PROGRESS,
          startedAt: new Date(),
          updatedAt: new Date(),
          statistics: { numberOfDocumentsScanned: 1, numberOfDocumentsFailed: 0 },
        }],
      });
      const syncStatusResult2 = await getSyncStatusHandler(
        createAdminEvent('GET', '/admin/rag/sync-status'), context
      );
      expect(syncStatusResult2.statusCode).toBe(200);
      const syncStatusBody2 = JSON.parse(syncStatusResult2.body);
      expect(syncStatusBody2.syncInProgress).toBe(true);
      expect(syncStatusBody2.status).toBe(IngestionJobStatus.IN_PROGRESS);

      // Step 4: List documents and verify the new document appears
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: uploadedDocuments.map((doc) => ({
          Key: doc.Key, Size: doc.Size, LastModified: doc.LastModified,
        })),
      });
      const listDocsResult = await listDocumentsHandler(
        createAdminEvent('GET', '/admin/rag/documents'), context
      );
      expect(listDocsResult.statusCode).toBe(200);
      const listDocsBody = JSON.parse(listDocsResult.body);
      expect(listDocsBody.documents.length).toBe(1);
      expect(listDocsBody.documents[0].fileName).toContain(testDocumentName);

      // Step 5: Delete the document
      s3Mock.on(DeleteObjectCommand).callsFake((input) => {
        const index = uploadedDocuments.findIndex((d) => d.Key === input.Key);
        if (index >= 0) uploadedDocuments.splice(index, 1);
        return {};
      });
      bedrockAgentMock.on(StartIngestionJobCommand).resolves({
        ingestionJob: {
          ingestionJobId: 'job-456',
          knowledgeBaseId: 'test-kb-id',
          dataSourceId: 'test-ds-id',
          status: IngestionJobStatus.STARTING,
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const deleteDocEvent = createAdminEvent('DELETE', `/admin/rag/documents/${uploadBody.documentId}`, {
        pathParameters: { documentId: uploadBody.documentId },
      });
      const deleteDocResult = await deleteDocumentHandler(deleteDocEvent, context);
      expect(deleteDocResult.statusCode).toBe(200);
      expect(JSON.parse(deleteDocResult.body).message).toContain('deleted');

      // Step 6: Verify document is removed
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: uploadedDocuments.map((doc) => ({
          Key: doc.Key, Size: doc.Size, LastModified: doc.LastModified,
        })),
      });
      const listDocsAfterDeleteResult = await listDocumentsHandler(
        createAdminEvent('GET', '/admin/rag/documents'), context
      );
      expect(listDocsAfterDeleteResult.statusCode).toBe(200);
      expect(JSON.parse(listDocsAfterDeleteResult.body).documents.length).toBe(0);
    });


    it('should validate file size limits for different file types', async () => {
      const context = createMockContext();

      // Test text document within limit (50MB)
      const validTextDocResult = await uploadDocumentHandler(
        createAdminEvent('POST', '/admin/rag/documents', {
          body: { fileName: 'valid-doc.pdf', fileSize: 40 * 1024 * 1024, contentType: 'application/pdf' },
        }),
        context
      );
      expect(validTextDocResult.statusCode).toBe(201);

      // Test text document exceeding limit (60MB > 50MB)
      const invalidTextDocResult = await uploadDocumentHandler(
        createAdminEvent('POST', '/admin/rag/documents', {
          body: { fileName: 'large-doc.pdf', fileSize: 60 * 1024 * 1024, contentType: 'application/pdf' },
        }),
        context
      );
      expect(invalidTextDocResult.statusCode).toBe(400);
      expect(JSON.parse(invalidTextDocResult.body).error).toContain('50MB');

      // Test image file within limit (3.75MB)
      const validImageResult = await uploadDocumentHandler(
        createAdminEvent('POST', '/admin/rag/documents', {
          body: { fileName: 'valid-image.png', fileSize: 3 * 1024 * 1024, contentType: 'image/png' },
        }),
        context
      );
      expect(validImageResult.statusCode).toBe(201);

      // Test image file exceeding limit (5MB > 3.75MB)
      const invalidImageResult = await uploadDocumentHandler(
        createAdminEvent('POST', '/admin/rag/documents', {
          body: { fileName: 'large-image.png', fileSize: 5 * 1024 * 1024, contentType: 'image/png' },
        }),
        context
      );
      expect(invalidImageResult.statusCode).toBe(400);
      expect(JSON.parse(invalidImageResult.body).error).toContain('3.75MB');
    });

    it('should reject unsupported file formats', async () => {
      const context = createMockContext();
      const unsupportedFileResult = await uploadDocumentHandler(
        createAdminEvent('POST', '/admin/rag/documents', {
          body: { fileName: 'script.exe', fileSize: 1024, contentType: 'application/octet-stream' },
        }),
        context
      );
      expect(unsupportedFileResult.statusCode).toBe(400);
      expect(JSON.parse(unsupportedFileResult.body).error).toContain('Unsupported file format');
    });

    it('should search documents by file name', async () => {
      const context = createMockContext();
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: '1234-report-2024.pdf', Size: 1024, LastModified: new Date() },
          { Key: '1235-manual-guide.docx', Size: 2048, LastModified: new Date() },
          { Key: '1236-report-2025.pdf', Size: 3072, LastModified: new Date() },
        ],
      });

      const searchResult = await listDocumentsHandler(
        createAdminEvent('GET', '/admin/rag/documents', { queryStringParameters: { search: 'report' } }),
        context
      );
      expect(searchResult.statusCode).toBe(200);
      const searchBody = JSON.parse(searchResult.body);
      expect(searchBody.documents.length).toBe(2);
      searchBody.documents.forEach((doc: { fileName: string }) => {
        expect(doc.fileName.toLowerCase()).toContain('report');
      });
    });

    it('should handle sync job completion status', async () => {
      const context = createMockContext();
      bedrockAgentMock.on(ListIngestionJobsCommand).resolves({
        ingestionJobSummaries: [{
          ingestionJobId: 'job-completed',
          knowledgeBaseId: 'test-kb-id',
          dataSourceId: 'test-ds-id',
          status: IngestionJobStatus.COMPLETE,
          startedAt: new Date(Date.now() - 60000),
          updatedAt: new Date(),
          statistics: { numberOfDocumentsScanned: 10, numberOfDocumentsFailed: 1 },
        }],
      });

      const syncStatusResult = await getSyncStatusHandler(
        createAdminEvent('GET', '/admin/rag/sync-status'), context
      );
      expect(syncStatusResult.statusCode).toBe(200);
      const syncStatusBody = JSON.parse(syncStatusResult.body);
      expect(syncStatusBody.syncInProgress).toBe(false);
      expect(syncStatusBody.status).toBe(IngestionJobStatus.COMPLETE);
      expect(syncStatusBody.documentsProcessed).toBe(10);
      expect(syncStatusBody.documentsFailed).toBe(1);
    });

    it('should handle sync job failure status', async () => {
      const context = createMockContext();
      bedrockAgentMock.on(ListIngestionJobsCommand).resolves({
        ingestionJobSummaries: [{
          ingestionJobId: 'job-failed',
          knowledgeBaseId: 'test-kb-id',
          dataSourceId: 'test-ds-id',
          status: IngestionJobStatus.FAILED,
          startedAt: new Date(Date.now() - 60000),
          updatedAt: new Date(),
          statistics: { numberOfDocumentsScanned: 5, numberOfDocumentsFailed: 5 },
        }],
      });

      const syncStatusResult = await getSyncStatusHandler(
        createAdminEvent('GET', '/admin/rag/sync-status'), context
      );
      expect(syncStatusResult.statusCode).toBe(200);
      const syncStatusBody = JSON.parse(syncStatusResult.body);
      expect(syncStatusBody.syncInProgress).toBe(false);
      expect(syncStatusBody.status).toBe(IngestionJobStatus.FAILED);
    });
  });


  /**
   * Integration Test: Cross-Feature Interactions
   * Tests interactions between different admin features.
   */
  describe('Cross-Feature Interactions', () => {
    it('should record audit logs for user management operations', async () => {
      const context = createMockContext();
      const auditLogs: Array<Record<string, unknown>> = [];

      dynamoDbMock.on(PutCommand).callsFake((input) => {
        if (input.Item && typeof input.Item.id === 'string' && input.Item.id.startsWith('admin#')) {
          auditLogs.push(input.Item);
        }
        return {};
      });

      // Create a user
      cognitoMock.on(AdminCreateUserCommand).resolves({
        User: {
          Username: 'audit-test@example.com',
          Attributes: [{ Name: 'email', Value: 'audit-test@example.com' }],
          Enabled: true, UserCreateDate: new Date(), UserStatus: 'CONFIRMED' as UserStatusType,
        },
      });
      await createUserHandler(
        createAdminEvent('POST', '/admin/users', { body: { email: 'audit-test@example.com', isAdmin: false } }),
        context
      );
      expect(auditLogs.find((log) => log.action === 'CREATE_USER')).toBeDefined();

      // Grant admin role
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
      await updateUserHandler(
        createAdminEvent('PUT', '/admin/users/audit-test@example.com', {
          pathParameters: { userId: 'audit-test@example.com' },
          body: { isAdmin: true },
        }),
        context
      );
      expect(auditLogs.find((log) => log.action === 'GRANT_ADMIN')).toBeDefined();

      // Delete user
      cognitoMock.on(AdminDeleteUserCommand).resolves({});
      await deleteUserHandler(
        createAdminEvent('DELETE', '/admin/users/audit-test@example.com', {
          pathParameters: { userId: 'audit-test@example.com' },
        }),
        context
      );
      expect(auditLogs.find((log) => log.action === 'DELETE_USER')).toBeDefined();
    });

    it('should record audit logs for RAG document operations', async () => {
      const context = createMockContext();
      const auditLogs: Array<Record<string, unknown>> = [];

      dynamoDbMock.on(PutCommand).callsFake((input) => {
        if (input.Item && typeof input.Item.id === 'string' && input.Item.id.startsWith('admin#')) {
          auditLogs.push(input.Item);
        }
        return {};
      });

      // Upload a document
      const uploadResult = await uploadDocumentHandler(
        createAdminEvent('POST', '/admin/rag/documents', {
          body: { fileName: 'audit-test.pdf', fileSize: 1024, contentType: 'application/pdf' },
        }),
        context
      );
      expect(uploadResult.statusCode).toBe(201);
      const uploadAuditLog = auditLogs.find((log) => log.action === 'UPLOAD_DOCUMENT');
      expect(uploadAuditLog).toBeDefined();
      expect((uploadAuditLog?.details as Record<string, unknown>)?.documentName).toBe('audit-test.pdf');

      // Delete the document
      s3Mock.on(DeleteObjectCommand).resolves({});
      bedrockAgentMock.on(StartIngestionJobCommand).resolves({
        ingestionJob: {
          ingestionJobId: 'job-123',
          knowledgeBaseId: 'test-kb-id',
          dataSourceId: 'test-ds-id',
          status: IngestionJobStatus.STARTING,
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const uploadBody = JSON.parse(uploadResult.body);
      await deleteDocumentHandler(
        createAdminEvent('DELETE', `/admin/rag/documents/${uploadBody.documentId}`, {
          pathParameters: { documentId: uploadBody.documentId },
        }),
        context
      );
      expect(auditLogs.find((log) => log.action === 'DELETE_DOCUMENT')).toBeDefined();
    });
  });


  /**
   * Integration Test: Error Handling Across Features
   * Tests that errors are handled consistently across all features.
   */
  describe('Error Handling', () => {
    it('should return 403 for non-admin users across all endpoints', async () => {
      const context = createMockContext();

      const createNonAdminEvent = (method: string, path: string): APIGatewayProxyEvent => ({
        body: null, headers: {}, multiValueHeaders: {}, httpMethod: method,
        isBase64Encoded: false, path, pathParameters: null, queryStringParameters: null,
        multiValueQueryStringParameters: null, stageVariables: null, resource: '',
        requestContext: {
          accountId: '123456789012', apiId: 'test-api-id',
          authorizer: { claims: { 'cognito:username': 'regular-user', email: 'user@example.com' } },
          protocol: 'HTTP/1.1', httpMethod: method,
          identity: {
            accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
            caller: null, clientCert: null, cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null, cognitoIdentityId: null,
            cognitoIdentityPoolId: null, principalOrgId: null,
            sourceIp: '127.0.0.1', user: null, userAgent: 'test-agent', userArn: null,
          },
          path, stage: 'test', requestId: 'test-request-id',
          requestTimeEpoch: Date.now(), resourceId: 'test-resource-id', resourcePath: path,
        },
      } as APIGatewayProxyEvent);

      // Test user management endpoints
      expect((await listUsersHandler(createNonAdminEvent('GET', '/admin/users'), context)).statusCode).toBe(403);

      // Test log viewer endpoints
      expect((await listLogsHandler(createNonAdminEvent('GET', '/admin/logs'), context)).statusCode).toBe(403);

      // Test RAG document endpoints
      expect((await listDocumentsHandler(createNonAdminEvent('GET', '/admin/rag/documents'), context)).statusCode).toBe(403);
      expect((await getSyncStatusHandler(createNonAdminEvent('GET', '/admin/rag/sync-status'), context)).statusCode).toBe(403);
    });

    it('should handle AWS service errors gracefully', async () => {
      const context = createMockContext();

      // Simulate Cognito error
      cognitoMock.on(ListUsersCommand).rejects(new Error('Service unavailable'));
      expect((await listUsersHandler(createAdminEvent('GET', '/admin/users'), context)).statusCode).toBe(500);

      // Simulate DynamoDB error
      dynamoDbMock.on(ScanCommand).rejects(new Error('Throughput exceeded'));
      expect((await listLogsHandler(createAdminEvent('GET', '/admin/logs'), context)).statusCode).toBe(500);

      // Simulate Bedrock Agent error
      bedrockAgentMock.on(ListIngestionJobsCommand).rejects(new Error('Access denied'));
      expect((await getSyncStatusHandler(createAdminEvent('GET', '/admin/rag/sync-status'), context)).statusCode).toBe(500);
    });
  });
});
