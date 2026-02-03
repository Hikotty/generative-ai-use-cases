/**
 * Unit tests for auditLog utility functions.
 *
 * Tests the audit logging functionality for admin operations.
 *
 * Requirements:
 * - 5.1: Record audit log when admin creates a user
 * - 5.2: Record audit log when admin deletes a user
 * - 5.3: Record audit log when admin grants admin role to a user
 * - 5.4: Record audit log when admin revokes admin role from a user
 * - 5.5: Record audit log when admin disables a user
 * - 5.6: Include action, target user ID, admin user ID, and timestamp in audit logs
 * - 13.6: Include request ID, user ID, and timestamp in all error logs
 */

import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import {
  recordAuditLog,
  recordUserCreation,
  recordUserDeletion,
  recordAdminGrant,
  recordAdminRevoke,
  recordUserDisable,
  recordUserEnable,
  recordBulkUserCreation,
  recordDocumentUpload,
  recordDocumentDeletion,
  setDynamoDbClient,
  resetDynamoDbClient,
  AuditAction,
} from '../../../../lambda/admin/utils/auditLog';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Store original env
const originalEnv = process.env;

describe('auditLog utility', () => {
  beforeEach(() => {
    // Reset mocks
    ddbMock.reset();
    resetDynamoDbClient();

    // Set up environment
    process.env = { ...originalEnv };
    process.env.TABLE_NAME = 'test-main-table';

    // Mock successful DynamoDB put
    ddbMock.on(PutCommand).resolves({});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('recordAuditLog', () => {
    /**
     * Validates: Requirements 5.6
     * Include action, target user ID, admin user ID, and timestamp in audit logs
     */
    it('should record audit log with required fields', async () => {
      const params = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'CREATE_USER' as AuditAction,
        targetUserId: 'user-456',
        targetEmail: 'user@example.com',
      };

      const result = await recordAuditLog(params);

      // Verify the result
      expect(result.id).toBe('admin#admin-123');
      expect(result.action).toBe('CREATE_USER');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.adminEmail).toBe('admin@example.com');
      expect(result.targetUserId).toBe('user-456');
      expect(result.targetEmail).toBe('user@example.com');
      expect(result.timestamp).toBeDefined();
      expect(result.createdDate).toBeDefined();

      // Verify DynamoDB was called
      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls).toHaveLength(1);

      const putParams = calls[0].args[0].input;
      expect(putParams.TableName).toBe('test-main-table');
      expect(putParams.Item?.id).toBe('admin#admin-123');
      expect(putParams.Item?.action).toBe('CREATE_USER');
    });

    it('should record audit log with details', async () => {
      const params = {
        adminUserId: 'admin-123',
        action: 'CREATE_USER' as AuditAction,
        details: { isAdmin: true, source: 'manual' },
      };

      const result = await recordAuditLog(params);

      expect(result.details).toEqual({ isAdmin: true, source: 'manual' });

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls[0].args[0].input.Item?.details).toEqual({
        isAdmin: true,
        source: 'manual',
      });
    });

    it('should not include optional fields when not provided', async () => {
      const params = {
        adminUserId: 'admin-123',
        action: 'UPDATE_SETTINGS' as AuditAction,
      };

      const result = await recordAuditLog(params);

      expect(result.adminEmail).toBeUndefined();
      expect(result.targetUserId).toBeUndefined();
      expect(result.targetEmail).toBeUndefined();
      expect(result.details).toBeUndefined();
    });

    it('should throw error when TABLE_NAME is not set', async () => {
      delete process.env.TABLE_NAME;

      await expect(
        recordAuditLog({
          adminUserId: 'admin-123',
          action: 'CREATE_USER',
        })
      ).rejects.toThrow('TABLE_NAME environment variable is not set');
    });

    it('should generate ISO 8601 timestamp', async () => {
      const beforeTime = new Date().toISOString();

      const result = await recordAuditLog({
        adminUserId: 'admin-123',
        action: 'CREATE_USER',
      });

      const afterTime = new Date().toISOString();

      // Timestamp should be between before and after
      expect(result.timestamp >= beforeTime).toBe(true);
      expect(result.timestamp <= afterTime).toBe(true);

      // Verify ISO 8601 format
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  describe('recordUserCreation', () => {
    /**
     * Validates: Requirements 5.1
     * Record audit log when admin creates a user
     */
    it('should record user creation audit log', async () => {
      const result = await recordUserCreation(
        'admin-123',
        'admin@example.com',
        'new-user-456',
        'newuser@example.com',
        false
      );

      expect(result.action).toBe('CREATE_USER');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.targetUserId).toBe('new-user-456');
      expect(result.targetEmail).toBe('newuser@example.com');
      expect(result.details).toEqual({ isAdmin: false });
    });

    it('should record user creation with admin role', async () => {
      const result = await recordUserCreation(
        'admin-123',
        'admin@example.com',
        'new-admin-789',
        'newadmin@example.com',
        true
      );

      expect(result.details).toEqual({ isAdmin: true });
    });
  });

  describe('recordUserDeletion', () => {
    /**
     * Validates: Requirements 5.2
     * Record audit log when admin deletes a user
     */
    it('should record user deletion audit log', async () => {
      const result = await recordUserDeletion(
        'admin-123',
        'admin@example.com',
        'deleted-user-456',
        'deleted@example.com'
      );

      expect(result.action).toBe('DELETE_USER');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.targetUserId).toBe('deleted-user-456');
      expect(result.targetEmail).toBe('deleted@example.com');
    });
  });

  describe('recordAdminGrant', () => {
    /**
     * Validates: Requirements 5.3
     * Record audit log when admin grants admin role to a user
     */
    it('should record admin grant audit log', async () => {
      const result = await recordAdminGrant(
        'admin-123',
        'admin@example.com',
        'promoted-user-456',
        'promoted@example.com'
      );

      expect(result.action).toBe('GRANT_ADMIN');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.targetUserId).toBe('promoted-user-456');
      expect(result.targetEmail).toBe('promoted@example.com');
    });
  });

  describe('recordAdminRevoke', () => {
    /**
     * Validates: Requirements 5.4
     * Record audit log when admin revokes admin role from a user
     */
    it('should record admin revoke audit log', async () => {
      const result = await recordAdminRevoke(
        'admin-123',
        'admin@example.com',
        'demoted-user-456',
        'demoted@example.com'
      );

      expect(result.action).toBe('REVOKE_ADMIN');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.targetUserId).toBe('demoted-user-456');
      expect(result.targetEmail).toBe('demoted@example.com');
    });
  });

  describe('recordUserDisable', () => {
    /**
     * Validates: Requirements 5.5
     * Record audit log when admin disables a user
     */
    it('should record user disable audit log', async () => {
      const result = await recordUserDisable(
        'admin-123',
        'admin@example.com',
        'disabled-user-456',
        'disabled@example.com'
      );

      expect(result.action).toBe('DISABLE_USER');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.targetUserId).toBe('disabled-user-456');
      expect(result.targetEmail).toBe('disabled@example.com');
    });
  });

  describe('recordUserEnable', () => {
    it('should record user enable audit log', async () => {
      const result = await recordUserEnable(
        'admin-123',
        'admin@example.com',
        'enabled-user-456',
        'enabled@example.com'
      );

      expect(result.action).toBe('ENABLE_USER');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.targetUserId).toBe('enabled-user-456');
      expect(result.targetEmail).toBe('enabled@example.com');
    });
  });

  describe('recordBulkUserCreation', () => {
    it('should record bulk user creation audit log', async () => {
      const result = await recordBulkUserCreation(
        'admin-123',
        'admin@example.com',
        10,
        2,
        { fileName: 'users.csv' }
      );

      expect(result.action).toBe('BULK_CREATE_USERS');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.details).toEqual({
        successCount: 10,
        failedCount: 2,
        fileName: 'users.csv',
      });
    });

    it('should record bulk user creation without additional details', async () => {
      const result = await recordBulkUserCreation('admin-123', undefined, 5, 0);

      expect(result.details).toEqual({
        successCount: 5,
        failedCount: 0,
      });
    });
  });

  describe('recordDocumentUpload', () => {
    it('should record document upload audit log', async () => {
      const result = await recordDocumentUpload(
        'admin-123',
        'admin@example.com',
        'document.pdf',
        1024000
      );

      expect(result.action).toBe('UPLOAD_DOCUMENT');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.details).toEqual({
        documentName: 'document.pdf',
        documentSize: 1024000,
      });
    });
  });

  describe('recordDocumentDeletion', () => {
    it('should record document deletion audit log', async () => {
      const result = await recordDocumentDeletion(
        'admin-123',
        'admin@example.com',
        'old-document.pdf'
      );

      expect(result.action).toBe('DELETE_DOCUMENT');
      expect(result.adminUserId).toBe('admin-123');
      expect(result.details).toEqual({
        documentName: 'old-document.pdf',
      });
    });
  });

  describe('DynamoDB client management', () => {
    it('should allow setting custom DynamoDB client', async () => {
      // Create a custom mock client
      const customMock = mockClient(DynamoDBDocumentClient);
      customMock.on(PutCommand).resolves({});

      // This test verifies the setDynamoDbClient function exists
      // In real usage, you would pass an actual client instance
      expect(typeof setDynamoDbClient).toBe('function');
      expect(typeof resetDynamoDbClient).toBe('function');
    });
  });

  describe('Audit log entry structure', () => {
    /**
     * Validates: Requirements 5.6
     * Audit log should have PK: admin#<adminUserId>, SK: timestamp
     */
    it('should create entry with correct PK format', async () => {
      const result = await recordAuditLog({
        adminUserId: 'test-admin-id',
        action: 'CREATE_USER',
      });

      expect(result.id).toBe('admin#test-admin-id');
    });

    it('should use timestamp as sort key (createdDate)', async () => {
      const result = await recordAuditLog({
        adminUserId: 'test-admin-id',
        action: 'CREATE_USER',
      });

      // createdDate should be the same as timestamp
      expect(result.createdDate).toBe(result.timestamp);
    });

    it('should log audit entry to console', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await recordAuditLog({
        adminUserId: 'admin-123',
        action: 'CREATE_USER',
        targetUserId: 'user-456',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Audit log recorded:',
        expect.objectContaining({
          action: 'CREATE_USER',
          adminUserId: 'admin-123',
          targetUserId: 'user-456',
        })
      );

      consoleLogSpy.mockRestore();
    });
  });
});
