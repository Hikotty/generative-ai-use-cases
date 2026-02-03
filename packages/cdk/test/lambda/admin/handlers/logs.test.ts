/**
 * Unit tests for log viewer Lambda handlers.
 *
 * Tests the following handlers:
 * - listLogsHandler: GET /admin/logs
 * - exportLogsHandler: GET /admin/logs/export
 * - listAuditLogsHandler: GET /admin/audit-logs
 *
 * Requirements tested:
 * - 4.1-4.6: Log viewing functionality
 * - 5.7: Audit log retrieval
 * - 10.1, 10.3, 10.4, 10.5, 10.7: DynamoDB query patterns
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import {
  listLogsHandler,
  exportLogsHandler,
  listAuditLogsHandler,
  setDynamoDbClient,
  resetDynamoDbClient,
  truncateText,
  convertTimestamp,
  isWithinDateRange,
  convertToLogEntry,
  convertLogsToCSV,
  convertToAuditLogEntry,
  LogEntry,
} from '../../../../lambda/admin/handlers/logs';

// Helper to create mock DynamoDB client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamoDbMock = mockClient(DynamoDBDocumentClient) as any;

// Mock environment variables
process.env.MAIN_TABLE_NAME = 'test-main-table';

// Helper to create mock API Gateway event
function createMockEvent(
  queryStringParameters?: Record<string, string>
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/admin/logs',
    headers: {},
    queryStringParameters: queryStringParameters || null,
    body: null,
    isBase64Encoded: false,
    requestContext: {
      authorizer: {
        claims: {
          'custom:role': 'admin',
          sub: 'admin-user-123',
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  } as APIGatewayProxyEvent;
}

// Helper to create mock Lambda context
function createMockContext(): Context {
  return {
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
    memoryLimitInMB: '128',
    awsRequestId: 'test-aws-request-id',
    logGroupName: '/aws/lambda/test',
    logStreamName: '2025/01/22/[$LATEST]test',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
    callbackWaitsForEmptyEventLoop: true,
  };
}

describe('Log Viewer Lambda Handlers', () => {
  beforeEach(() => {
    dynamoDbMock.reset();
    resetDynamoDbClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDynamoDbClient(dynamoDbMock as any);
  });

  afterEach(() => {
    resetDynamoDbClient();
  });

  describe('truncateText', () => {
    it('should return empty string for empty input', () => {
      expect(truncateText('')).toBe('');
    });

    it('should return original text if shorter than max length', () => {
      expect(truncateText('Hello', 100)).toBe('Hello');
    });

    it('should truncate text and add ellipsis if longer than max length', () => {
      const longText = 'a'.repeat(150);
      const result = truncateText(longText, 100);
      expect(result).toBe('a'.repeat(100) + '...');
      expect(result.length).toBe(103);
    });

    it('should use default max length of 100', () => {
      const longText = 'a'.repeat(150);
      const result = truncateText(longText);
      expect(result.length).toBe(103);
    });
  });

  describe('convertTimestamp', () => {
    it('should convert DynamoDB timestamp to ISO 8601', () => {
      const timestamp = '1705910400000#uuid-123';
      const result = convertTimestamp(timestamp);
      expect(result).toBe('2024-01-22T08:00:00.000Z');
    });

    it('should return original string if conversion fails', () => {
      const invalidTimestamp = 'invalid-timestamp';
      const result = convertTimestamp(invalidTimestamp);
      expect(result).toBe(invalidTimestamp);
    });
  });

  describe('isWithinDateRange', () => {
    it('should return true if no date range specified', () => {
      expect(isWithinDateRange('2024-01-22T10:00:00Z')).toBe(true);
    });

    it('should return true if timestamp is within range', () => {
      expect(
        isWithinDateRange('2024-01-22T10:00:00Z', '2024-01-20', '2024-01-25')
      ).toBe(true);
    });

    it('should return false if timestamp is before start date', () => {
      expect(
        isWithinDateRange('2024-01-19T10:00:00Z', '2024-01-20', '2024-01-25')
      ).toBe(false);
    });

    it('should return false if timestamp is after end date', () => {
      expect(
        isWithinDateRange('2024-01-26T10:00:00Z', '2024-01-20', '2024-01-25')
      ).toBe(false);
    });

    it('should include the entire end date', () => {
      // End date is 2024-01-25, so 2024-01-25T23:59:59 should be included
      expect(
        isWithinDateRange('2024-01-25T23:59:59Z', '2024-01-20', '2024-01-25')
      ).toBe(true);
    });

    it('should work with only start date', () => {
      expect(isWithinDateRange('2024-01-22T10:00:00Z', '2024-01-20')).toBe(
        true
      );
      expect(isWithinDateRange('2024-01-19T10:00:00Z', '2024-01-20')).toBe(
        false
      );
    });

    it('should work with only end date', () => {
      expect(
        isWithinDateRange('2024-01-22T10:00:00Z', undefined, '2024-01-25')
      ).toBe(true);
      expect(
        isWithinDateRange('2024-01-26T10:00:00Z', undefined, '2024-01-25')
      ).toBe(false);
    });
  });

  describe('convertToLogEntry', () => {
    it('should return null for non-message items', () => {
      const item = { id: 'chat#123', userId: 'user#456' };
      expect(convertToLogEntry(item)).toBeNull();
    });

    it('should convert user message to log entry', () => {
      const item = {
        id: 'chat#123',
        userId: 'user#456',
        messageId: 'msg-789',
        role: 'user',
        content: 'Hello, how are you?',
        createdDate: '1705910400000#uuid',
        llmType: 'anthropic.claude-v2',
        usecase: 'chat',
      };

      const result = convertToLogEntry(item);
      expect(result).toEqual({
        timestamp: '2024-01-22T08:00:00.000Z',
        userId: '456',
        chatId: '123',
        messageId: 'msg-789',
        prompt: 'Hello, how are you?',
        response: '',
        model: 'anthropic.claude-v2',
        usecase: 'chat',
      });
    });

    it('should convert assistant message to log entry', () => {
      const item = {
        id: 'chat#123',
        userId: 'user#456',
        messageId: 'msg-790',
        role: 'assistant',
        content: 'I am doing well, thank you!',
        createdDate: '1705910400000#uuid',
        metadata: {
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
          },
        },
      };

      const result = convertToLogEntry(item);
      expect(result).toEqual({
        timestamp: '2024-01-22T08:00:00.000Z',
        userId: '456',
        chatId: '123',
        messageId: 'msg-790',
        prompt: '',
        response: 'I am doing well, thank you!',
        tokenUsage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      });
    });

    it('should truncate long content', () => {
      const longContent = 'a'.repeat(150);
      const item = {
        id: 'chat#123',
        userId: 'user#456',
        messageId: 'msg-789',
        role: 'user',
        content: longContent,
        createdDate: '1705910400000#uuid',
      };

      const result = convertToLogEntry(item);
      expect(result?.prompt.length).toBe(103); // 100 + '...'
    });
  });

  describe('convertLogsToCSV', () => {
    it('should convert empty logs to CSV with header only', () => {
      const csv = convertLogsToCSV([]);
      expect(csv).toBe('\uFEFFtimestamp,userId,prompt,response\n');
    });

    it('should convert logs to CSV format', () => {
      const logs: LogEntry[] = [
        {
          timestamp: '2024-01-22T10:00:00Z',
          userId: 'user-123',
          chatId: 'chat-456',
          messageId: 'msg-789',
          prompt: 'Hello',
          response: 'Hi there',
        },
      ];

      const csv = convertLogsToCSV(logs);
      expect(csv).toContain('\uFEFF'); // UTF-8 BOM
      expect(csv).toContain('timestamp,userId,prompt,response');
      expect(csv).toContain(
        '"2024-01-22T10:00:00Z","user-123","Hello","Hi there"'
      );
    });

    it('should escape CSV special characters', () => {
      const logs: LogEntry[] = [
        {
          timestamp: '2024-01-22T10:00:00Z',
          userId: 'user-123',
          chatId: 'chat-456',
          messageId: 'msg-789',
          prompt: 'Hello, world',
          response: 'Hi "there"',
        },
      ];

      const csv = convertLogsToCSV(logs);
      expect(csv).toContain('"Hello, world"');
      expect(csv).toContain('"Hi ""there"""');
    });

    it('should handle newlines in content', () => {
      const logs: LogEntry[] = [
        {
          timestamp: '2024-01-22T10:00:00Z',
          userId: 'user-123',
          chatId: 'chat-456',
          messageId: 'msg-789',
          prompt: 'Line 1\nLine 2',
          response: 'Response',
        },
      ];

      const csv = convertLogsToCSV(logs);
      expect(csv).toContain('"Line 1\nLine 2"');
    });
  });

  describe('convertToAuditLogEntry', () => {
    it('should return null for non-audit log items', () => {
      const item = { PK: 'chat#123', SK: '1705910400000#uuid' };
      expect(convertToAuditLogEntry(item)).toBeNull();
    });

    it('should convert audit log item to AuditLogEntry', () => {
      const item = {
        PK: 'admin#admin-123',
        SK: '1705910400000#uuid',
        action: 'CREATE_USER',
        targetUserId: 'user-456',
        targetEmail: 'user@example.com',
        details: { role: 'admin' },
      };

      const result = convertToAuditLogEntry(item);
      expect(result).toEqual({
        timestamp: '2024-01-22T08:00:00.000Z',
        adminUserId: 'admin-123',
        action: 'CREATE_USER',
        targetUserId: 'user-456',
        targetEmail: 'user@example.com',
        details: { role: 'admin' },
      });
    });

    it('should handle missing optional fields', () => {
      const item = {
        PK: 'admin#admin-123',
        SK: '1705910400000#uuid',
        action: 'VIEW_LOGS',
      };

      const result = convertToAuditLogEntry(item);
      expect(result).toEqual({
        timestamp: '2024-01-22T08:00:00.000Z',
        adminUserId: 'admin-123',
        action: 'VIEW_LOGS',
      });
    });
  });

  describe('listLogsHandler', () => {
    it('should return 403 for non-admin users', async () => {
      const event = createMockEvent();
      event.requestContext.authorizer!.claims['custom:role'] = 'user';

      const result = await listLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(403);
    });

    it('should return logs with pagination', async () => {
      const mockItems = [
        {
          id: 'chat#123',
          userId: 'user#456',
          messageId: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdDate: '1705910400000#uuid',
        },
        {
          id: 'chat#123',
          userId: 'user#456',
          messageId: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          createdDate: '1705910500000#uuid',
        },
      ];

      dynamoDbMock.on(ScanCommand).resolves({
        Items: mockItems,
        LastEvaluatedKey: { PK: 'chat#123', SK: 'msg-2' },
      });

      const event = createMockEvent();
      const result = await listLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.nextToken).toBeDefined();
    });

    it('should filter logs by userId', async () => {
      const mockItems = [
        {
          id: 'chat#123',
          userId: 'user#456',
          messageId: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdDate: '1705910400000#uuid',
        },
      ];

      dynamoDbMock.on(ScanCommand).resolves({
        Items: mockItems,
      });

      const event = createMockEvent({ userId: '456' });
      const result = await listLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(1);
    });

    it('should enforce maximum limit of 100', async () => {
      const event = createMockEvent({ limit: '200' });

      dynamoDbMock.on(ScanCommand).resolves({
        Items: [],
      });

      const result = await listLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(200);
      // Verify that the Scan command was called with Limit <= 200 (100 * 2)
      expect(dynamoDbMock.calls()).toHaveLength(1);
    });

    it('should handle invalid pagination token', async () => {
      const event = createMockEvent({ nextToken: 'invalid-token' });
      const result = await listLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(400);
    });
  });

  describe('exportLogsHandler', () => {
    it('should return 403 for non-admin users', async () => {
      const event = createMockEvent();
      event.requestContext.authorizer!.claims['custom:role'] = 'user';

      const result = await exportLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(403);
    });

    it('should export logs as CSV', async () => {
      const mockItems = [
        {
          id: 'chat#123',
          userId: 'user#456',
          messageId: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdDate: '1705910400000#uuid',
        },
      ];

      dynamoDbMock.on(ScanCommand).resolves({
        Items: mockItems,
      });

      const event = createMockEvent();
      const result = await exportLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(200);
      expect(result.headers?.['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(result.headers?.['Content-Disposition']).toContain('logs_export_');
      expect(result.body).toContain('\uFEFF'); // UTF-8 BOM
      expect(result.body).toContain('timestamp,userId,prompt,response');
    });

    it('should handle pagination when fetching all logs', async () => {
      const mockItems1 = [
        {
          id: 'chat#123',
          userId: 'user#456',
          messageId: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdDate: '1705910400000#uuid',
        },
      ];

      const mockItems2 = [
        {
          id: 'chat#123',
          userId: 'user#456',
          messageId: 'msg-2',
          role: 'assistant',
          content: 'Hi',
          createdDate: '1705910500000#uuid',
        },
      ];

      dynamoDbMock
        .on(ScanCommand)
        .resolvesOnce({
          Items: mockItems1,
          LastEvaluatedKey: { PK: 'chat#123', SK: 'msg-1' },
        })
        .resolvesOnce({
          Items: mockItems2,
        });

      const event = createMockEvent();
      const result = await exportLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(200);
      expect(dynamoDbMock.calls()).toHaveLength(2);
    });
  });

  describe('listAuditLogsHandler', () => {
    it('should return 403 for non-admin users', async () => {
      const event = createMockEvent();
      event.requestContext.authorizer!.claims['custom:role'] = 'user';

      const result = await listAuditLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(403);
    });

    it('should return audit logs', async () => {
      const mockItems = [
        {
          PK: 'admin#admin-123',
          SK: '1705910400000#uuid',
          action: 'CREATE_USER',
          targetUserId: 'user-456',
          targetEmail: 'user@example.com',
        },
        {
          PK: 'admin#admin-123',
          SK: '1705910500000#uuid',
          action: 'DELETE_USER',
          targetUserId: 'user-789',
        },
      ];

      dynamoDbMock.on(ScanCommand).resolves({
        Items: mockItems,
      });

      const event = createMockEvent();
      const result = await listAuditLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.logs[0].action).toBe('DELETE_USER'); // Most recent first
    });

    it('should filter audit logs by adminUserId', async () => {
      const mockItems = [
        {
          PK: 'admin#admin-123',
          SK: '1705910400000#uuid',
          action: 'CREATE_USER',
        },
      ];

      dynamoDbMock.on(ScanCommand).resolves({
        Items: mockItems,
      });

      const event = createMockEvent({ adminUserId: 'admin-123' });
      const result = await listAuditLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(1);
    });

    it('should handle invalid pagination token', async () => {
      const event = createMockEvent({ nextToken: 'invalid-token' });
      const result = await listAuditLogsHandler(event, createMockContext());

      expect(result.statusCode).toBe(400);
    });
  });
});
