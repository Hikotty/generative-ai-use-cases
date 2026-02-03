/**
 * Unit tests for application settings management Lambda handler.
 *
 * Tests cover:
 * - Settings JSON validation
 * - Icon file extension validation
 * - Icon size validation
 * - Handler integration tests
 *
 * Requirements:
 * - 18.1: Read current settings from S3 bucket and display
 * - 18.3: Accept image files (PNG, SVG, JPG) for icon upload
 * - 18.4: Validate image size (max 1MB)
 * - 18.5: Save settings file (JSON) to S3 bucket
 * - 18.6: Save icons to S3 and serve via CloudFront
 * - 18.7: Record audit log when settings are updated
 * - 18.10: Load latest settings from S3 on frontend startup
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';
import {
  getFileExtension,
  isSupportedIconExtension,
  validateIconSize,
  validateAppSettings,
  getSettingsHandler,
  updateSettingsHandler,
  uploadIconHandler,
  resetS3Client,
  DEFAULT_SETTINGS,
  SUPPORTED_ICON_EXTENSIONS,
  MAX_ICON_SIZE,
  AppSettings,
} from '../../../../lambda/admin/handlers/settings';
import { resetDynamoDbClient as resetAuditDynamoDbClient } from '../../../../lambda/admin/utils/auditLog';

const s3Mock = mockClient(S3Client);
const ddbMock = mockClient(DynamoDBDocumentClient);

/**
 * Helper function to create a mock S3 body stream.
 */
function createMockS3Body(content: string) {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return sdkStreamMixin(stream);
}

describe('File Extension Utilities', () => {
  describe('getFileExtension', () => {
    it('should extract extension from file name', () => {
      expect(getFileExtension('icon.png')).toBe('.png');
      expect(getFileExtension('my-icon.svg')).toBe('.svg');
      expect(getFileExtension('photo.jpg')).toBe('.jpg');
      expect(getFileExtension('image.jpeg')).toBe('.jpeg');
    });

    it('should return lowercase extension', () => {
      expect(getFileExtension('icon.PNG')).toBe('.png');
      expect(getFileExtension('icon.SVG')).toBe('.svg');
      expect(getFileExtension('icon.JPG')).toBe('.jpg');
    });

    it('should handle files with multiple dots', () => {
      expect(getFileExtension('my.icon.file.png')).toBe('.png');
      expect(getFileExtension('test.file.svg')).toBe('.svg');
    });

    it('should return empty string for files without extension', () => {
      expect(getFileExtension('noextension')).toBe('');
      expect(getFileExtension('file')).toBe('');
    });

    it('should handle empty string', () => {
      expect(getFileExtension('')).toBe('');
    });
  });

  describe('isSupportedIconExtension', () => {
    it('should accept supported icon formats', () => {
      // Requirement 18.3: Accept image files (PNG, SVG, JPG)
      expect(isSupportedIconExtension('.png')).toBe(true);
      expect(isSupportedIconExtension('.svg')).toBe(true);
      expect(isSupportedIconExtension('.jpg')).toBe(true);
      expect(isSupportedIconExtension('.jpeg')).toBe(true);
    });

    it('should accept uppercase extensions', () => {
      expect(isSupportedIconExtension('.PNG')).toBe(true);
      expect(isSupportedIconExtension('.SVG')).toBe(true);
      expect(isSupportedIconExtension('.JPG')).toBe(true);
    });

    it('should reject unsupported formats', () => {
      expect(isSupportedIconExtension('.gif')).toBe(false);
      expect(isSupportedIconExtension('.bmp')).toBe(false);
      expect(isSupportedIconExtension('.webp')).toBe(false);
      expect(isSupportedIconExtension('.ico')).toBe(false);
      expect(isSupportedIconExtension('.pdf')).toBe(false);
    });

    it('should reject empty extension', () => {
      expect(isSupportedIconExtension('')).toBe(false);
    });
  });
});

describe('Icon Size Validation', () => {
  describe('validateIconSize', () => {
    it('should accept valid icon sizes', () => {
      // Requirement 18.4: Validate image size (max 1MB)
      expect(validateIconSize(1).valid).toBe(true);
      expect(validateIconSize(1024).valid).toBe(true);
      expect(validateIconSize(512 * 1024).valid).toBe(true); // 512KB
      expect(validateIconSize(MAX_ICON_SIZE).valid).toBe(true); // Exactly 1MB
    });

    it('should reject files exceeding 1MB', () => {
      const result = validateIconSize(MAX_ICON_SIZE + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1MB');
    });

    it('should reject zero size', () => {
      const result = validateIconSize(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should reject negative size', () => {
      const result = validateIconSize(-100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should accept size just under the limit', () => {
      const result = validateIconSize(MAX_ICON_SIZE - 1);
      expect(result.valid).toBe(true);
    });
  });
});

describe('Settings Validation', () => {
  describe('validateAppSettings', () => {
    it('should accept valid complete settings', () => {
      const settings: AppSettings = {
        appName: 'My App',
        welcomeMessage: 'Welcome!',
        useCases: {
          chat: {
            title: 'Chat',
            icon: '/icons/chat.png',
            enabled: true,
          },
        },
      };

      const result = validateAppSettings(settings);
      expect(result.valid).toBe(true);
    });

    it('should accept empty settings object', () => {
      const result = validateAppSettings({});
      expect(result.valid).toBe(true);
    });

    it('should accept partial settings', () => {
      expect(validateAppSettings({ appName: 'Test' }).valid).toBe(true);
      expect(validateAppSettings({ welcomeMessage: 'Hello' }).valid).toBe(true);
      expect(validateAppSettings({ useCases: {} }).valid).toBe(true);
    });

    it('should reject non-object settings', () => {
      expect(validateAppSettings(null).valid).toBe(false);
      expect(validateAppSettings(undefined).valid).toBe(false);
      expect(validateAppSettings('string').valid).toBe(false);
      expect(validateAppSettings(123).valid).toBe(false);
    });

    it('should reject non-string appName', () => {
      const result = validateAppSettings({ appName: 123 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('appName');
      expect(result.error).toContain('string');
    });

    it('should reject non-string welcomeMessage', () => {
      const result = validateAppSettings({ welcomeMessage: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('welcomeMessage');
    });

    it('should reject non-object useCases', () => {
      const result = validateAppSettings({ useCases: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('useCases');
    });

    it('should reject non-object use case entry', () => {
      const result = validateAppSettings({
        useCases: {
          chat: 'invalid',
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('useCases.chat');
    });

    it('should reject non-string use case title', () => {
      const result = validateAppSettings({
        useCases: {
          chat: {
            title: 123,
            icon: '/icon.png',
          },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('title');
    });

    it('should reject non-string use case icon', () => {
      const result = validateAppSettings({
        useCases: {
          chat: {
            title: 'Chat',
            icon: 123,
          },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('icon');
    });

    it('should reject non-boolean use case enabled', () => {
      const result = validateAppSettings({
        useCases: {
          chat: {
            title: 'Chat',
            icon: '/icon.png',
            enabled: 'yes',
          },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('enabled');
    });

    it('should accept multiple use cases', () => {
      const settings = {
        useCases: {
          chat: { title: 'Chat', icon: '/chat.png' },
          rag: { title: 'RAG', icon: '/rag.png' },
          agent: { title: 'Agent', icon: '/agent.png', enabled: false },
        },
      };

      const result = validateAppSettings(settings);
      expect(result.valid).toBe(true);
    });
  });
});

describe('Handler Integration Tests', () => {
  beforeEach(() => {
    s3Mock.reset();
    ddbMock.reset();
    resetS3Client();
    resetAuditDynamoDbClient();
    process.env.SETTINGS_BUCKET_NAME = 'test-settings-bucket';
    process.env.TABLE_NAME = 'test-table';
    process.env.AWS_REGION = 'us-east-1';

    // Mock DynamoDB operations for audit logging
    ddbMock.on(PutCommand).resolves({});
  });

  afterEach(() => {
    delete process.env.SETTINGS_BUCKET_NAME;
    delete process.env.TABLE_NAME;
    delete process.env.AWS_REGION;
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

  describe('getSettingsHandler', () => {
    it('should return settings from S3', async () => {
      // Requirement 18.1: Read current settings from S3 bucket
      const mockSettings: AppSettings = {
        appName: 'Custom App',
        welcomeMessage: 'Custom welcome',
        useCases: {
          chat: { title: 'Custom Chat', icon: '/custom-chat.png' },
        },
        updatedAt: '2025-01-22T10:00:00Z',
        updatedBy: 'admin@example.com',
      };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockS3Body(JSON.stringify(mockSettings)),
      });

      const result = await getSettingsHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.appName).toBe('Custom App');
      expect(body.welcomeMessage).toBe('Custom welcome');
      expect(body.useCases.chat.title).toBe('Custom Chat');
    });

    it('should return default settings when file does not exist', async () => {
      // Requirement 18.1: Return default settings if file doesn't exist
      const noSuchKeyError = new Error('NoSuchKey');
      noSuchKeyError.name = 'NoSuchKey';
      s3Mock.on(GetObjectCommand).rejects(noSuchKeyError);

      const result = await getSettingsHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.appName).toBe(DEFAULT_SETTINGS.appName);
      expect(body.welcomeMessage).toBe(DEFAULT_SETTINGS.welcomeMessage);
    });

    it('should return 403 for non-admin user', async () => {
      const result = await getSettingsHandler(mockNonAdminEvent, mockContext);
      expect(result.statusCode).toBe(403);
    });

    it('should handle S3 errors gracefully', async () => {
      s3Mock.on(GetObjectCommand).rejects(new Error('S3 Error'));

      const result = await getSettingsHandler(mockAdminEvent, mockContext);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('updateSettingsHandler', () => {
    it('should update settings in S3', async () => {
      // Requirement 18.5: Save settings file (JSON) to S3 bucket
      const currentSettings: AppSettings = {
        appName: 'Old App',
        welcomeMessage: 'Old message',
        useCases: {},
      };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockS3Body(JSON.stringify(currentSettings)),
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          appName: 'New App',
        }),
      };

      const result = await updateSettingsHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('updated');
      expect(body.settings.appName).toBe('New App');
      expect(body.settings.welcomeMessage).toBe('Old message'); // Preserved
      expect(body.settings.updatedBy).toBe('admin@example.com');
    });

    it('should merge use cases properly', async () => {
      const currentSettings: AppSettings = {
        appName: 'App',
        welcomeMessage: 'Welcome',
        useCases: {
          chat: { title: 'Chat', icon: '/chat.png' },
          rag: { title: 'RAG', icon: '/rag.png' },
        },
      };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockS3Body(JSON.stringify(currentSettings)),
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          useCases: {
            chat: { title: 'Updated Chat', icon: '/new-chat.png' },
          },
        }),
      };

      const result = await updateSettingsHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.settings.useCases.chat.title).toBe('Updated Chat');
      expect(body.settings.useCases.rag.title).toBe('RAG'); // Preserved
    });

    it('should record audit log', async () => {
      // Requirement 18.7: Record audit log when settings are updated
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockS3Body(JSON.stringify(DEFAULT_SETTINGS)),
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          appName: 'New App',
        }),
      };

      await updateSettingsHandler(eventWithBody, mockContext);

      // Verify audit log was recorded
      const ddbCalls = ddbMock.commandCalls(PutCommand);
      expect(ddbCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject missing request body', async () => {
      const result = await updateSettingsHandler(mockAdminEvent, mockContext);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Request body');
    });

    it('should reject invalid JSON', async () => {
      const eventWithInvalidBody = {
        ...mockAdminEvent,
        body: 'invalid json',
      };

      const result = await updateSettingsHandler(
        eventWithInvalidBody,
        mockContext
      );
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid JSON');
    });

    it('should reject invalid settings structure', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          appName: 123, // Should be string
        }),
      };

      const result = await updateSettingsHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('appName');
    });

    it('should return 403 for non-admin user', async () => {
      const eventWithBody = {
        ...mockNonAdminEvent,
        body: JSON.stringify({ appName: 'Test' }),
      };

      const result = await updateSettingsHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(403);
    });

    it('should use default settings when file does not exist', async () => {
      const noSuchKeyError = new Error('NoSuchKey');
      noSuchKeyError.name = 'NoSuchKey';
      s3Mock.on(GetObjectCommand).rejects(noSuchKeyError);
      s3Mock.on(PutObjectCommand).resolves({});

      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          appName: 'New App',
        }),
      };

      const result = await updateSettingsHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.settings.appName).toBe('New App');
      expect(body.settings.welcomeMessage).toBe(DEFAULT_SETTINGS.welcomeMessage);
    });
  });

  describe('uploadIconHandler', () => {
    it('should generate presigned URL for valid icon', async () => {
      // Requirements 18.3, 18.6: Accept image files and save to S3
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'custom-icon.png',
          fileSize: 50000,
          contentType: 'image/png',
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.uploadUrl).toBeDefined();
      expect(body.iconUrl).toBeDefined();
      expect(body.iconUrl).toContain('custom-icons/');
      expect(body.iconUrl).toContain('custom-icon.png');
      expect(body.expiresAt).toBeDefined();
    });

    it('should accept PNG files', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'icon.png',
          fileSize: 10000,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(201);
    });

    it('should accept SVG files', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'icon.svg',
          fileSize: 5000,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(201);
    });

    it('should accept JPG files', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'icon.jpg',
          fileSize: 20000,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(201);
    });

    it('should accept JPEG files', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'icon.jpeg',
          fileSize: 20000,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(201);
    });

    it('should reject unsupported file formats', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'icon.gif',
          fileSize: 10000,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Unsupported');
      expect(body.error).toContain(SUPPORTED_ICON_EXTENSIONS.join(', '));
    });

    it('should reject files exceeding 1MB', async () => {
      // Requirement 18.4: Validate image size (max 1MB)
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'large-icon.png',
          fileSize: MAX_ICON_SIZE + 1,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('1MB');
    });

    it('should reject missing fileName', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileSize: 10000,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('fileName');
    });

    it('should reject missing fileSize', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'icon.png',
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('fileSize');
    });

    it('should reject zero fileSize', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'icon.png',
          fileSize: 0,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(400);
    });

    it('should reject files without extension', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          fileName: 'noextension',
          fileSize: 10000,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('extension');
    });

    it('should reject missing request body', async () => {
      const result = await uploadIconHandler(mockAdminEvent, mockContext);
      expect(result.statusCode).toBe(400);
    });

    it('should reject invalid JSON', async () => {
      const eventWithInvalidBody = {
        ...mockAdminEvent,
        body: 'invalid json',
      };

      const result = await uploadIconHandler(eventWithInvalidBody, mockContext);
      expect(result.statusCode).toBe(400);
    });

    it('should return 403 for non-admin user', async () => {
      const eventWithBody = {
        ...mockNonAdminEvent,
        body: JSON.stringify({
          fileName: 'icon.png',
          fileSize: 10000,
        }),
      };

      const result = await uploadIconHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(403);
    });
  });
});

describe('Default Settings', () => {
  it('should have required fields', () => {
    expect(DEFAULT_SETTINGS.appName).toBeDefined();
    expect(DEFAULT_SETTINGS.welcomeMessage).toBeDefined();
    expect(DEFAULT_SETTINGS.useCases).toBeDefined();
  });

  it('should have common use cases', () => {
    expect(DEFAULT_SETTINGS.useCases.chat).toBeDefined();
    expect(DEFAULT_SETTINGS.useCases.rag).toBeDefined();
  });

  it('should have valid use case structure', () => {
    for (const useCase of Object.values(DEFAULT_SETTINGS.useCases)) {
      expect(useCase.title).toBeDefined();
      expect(typeof useCase.title).toBe('string');
      expect(useCase.icon).toBeDefined();
      expect(typeof useCase.icon).toBe('string');
    }
  });
});

describe('Edge Cases', () => {
  describe('validateAppSettings edge cases', () => {
    it('should handle null use case value', () => {
      const result = validateAppSettings({
        useCases: {
          chat: null,
        },
      });
      expect(result.valid).toBe(false);
    });

    it('should handle empty use case object', () => {
      const result = validateAppSettings({
        useCases: {
          chat: {},
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should handle additional unknown fields in settings', () => {
      const result = validateAppSettings({
        appName: 'Test',
        unknownField: 'value',
      });
      expect(result.valid).toBe(true);
    });

    it('should handle additional unknown fields in use case', () => {
      const result = validateAppSettings({
        useCases: {
          chat: {
            title: 'Chat',
            icon: '/chat.png',
            unknownField: 'value',
          },
        },
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateIconSize edge cases', () => {
    it('should handle exactly 1MB', () => {
      const result = validateIconSize(MAX_ICON_SIZE);
      expect(result.valid).toBe(true);
    });

    it('should handle 1 byte over limit', () => {
      const result = validateIconSize(MAX_ICON_SIZE + 1);
      expect(result.valid).toBe(false);
    });

    it('should handle very small files', () => {
      const result = validateIconSize(1);
      expect(result.valid).toBe(true);
    });
  });

  describe('getFileExtension edge cases', () => {
    it('should handle file starting with dot', () => {
      expect(getFileExtension('.gitignore')).toBe('.gitignore');
    });

    it('should handle file ending with dot', () => {
      expect(getFileExtension('file.')).toBe('.');
    });
  });
});
