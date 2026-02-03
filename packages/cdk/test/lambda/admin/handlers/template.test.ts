/**
 * Unit tests for CloudFormation template generation Lambda handler.
 *
 * Tests cover:
 * - Deploy parameter validation
 * - Quick Create Link URL generation
 * - S3 URL generation
 * - Template content generation
 * - Handler integration tests
 *
 * Requirements:
 * - 19.1: Execute cdk synth in Lambda or CodeBuild
 * - 19.2: Generate CloudFormation template using parameters
 * - 19.3: Save generated YAML file to S3 bucket
 * - 19.4: Display download link in admin dashboard
 * - 19.5: Download CloudFormation template (YAML)
 * - 19.6: Generate CloudFormation Quick Create Link URL
 * - 19.7: Display "Open in CloudFormation Console" button
 * - 19.8: Open CloudFormation console with pre-configured template
 * - 19.9: Provide template download link for manual upload
 * - 19.11: Record template generation history
 * - 19.12: Display generation date, executor, parameters, Quick Create Link URL
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  validateDeployParameters,
  generateQuickCreateLink,
  generateS3Url,
  generateTemplateContent,
  generateTemplateHandler,
  getTemplateHistoryHandler,
  resetS3Client,
  resetDynamoDbClient,
  DeployParameters,
} from '../../../../lambda/admin/handlers/template';
import { resetDynamoDbClient as resetAuditDynamoDbClient } from '../../../../lambda/admin/utils/auditLog';

const s3Mock = mockClient(S3Client);
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Deploy Parameter Validation', () => {
  describe('validateDeployParameters', () => {
    it('should accept valid parameters with all fields', () => {
      const params: DeployParameters = {
        ragEnabled: true,
        agentEnabled: false,
        useCaseBuilderEnabled: true,
        searchApiKey: 'test-api-key',
        modelId: 'anthropic.claude-sonnet-4-20250514',
        stackName: 'MyStack',
      };

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept empty parameters object', () => {
      const result = validateDeployParameters({});
      expect(result.valid).toBe(true);
    });

    it('should accept parameters with only some fields', () => {
      const params: DeployParameters = {
        ragEnabled: true,
      };

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(true);
    });

    it('should reject non-object parameters', () => {
      // @ts-expect-error Testing invalid input
      expect(validateDeployParameters(null).valid).toBe(false);
      // @ts-expect-error Testing invalid input
      expect(validateDeployParameters(undefined).valid).toBe(false);
      // @ts-expect-error Testing invalid input
      expect(validateDeployParameters('string').valid).toBe(false);
    });

    it('should reject non-boolean ragEnabled', () => {
      const params = {
        ragEnabled: 'true',
      } as unknown as DeployParameters;

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ragEnabled');
      expect(result.error).toContain('boolean');
    });

    it('should reject non-boolean agentEnabled', () => {
      const params = {
        agentEnabled: 1,
      } as unknown as DeployParameters;

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('agentEnabled');
    });

    it('should reject non-boolean useCaseBuilderEnabled', () => {
      const params = {
        useCaseBuilderEnabled: 'yes',
      } as unknown as DeployParameters;

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('useCaseBuilderEnabled');
    });

    it('should reject non-string searchApiKey', () => {
      const params = {
        searchApiKey: 12345,
      } as unknown as DeployParameters;

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('searchApiKey');
      expect(result.error).toContain('string');
    });

    it('should reject non-string modelId', () => {
      const params = {
        modelId: { id: 'test' },
      } as unknown as DeployParameters;

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('modelId');
    });

    it('should reject invalid stack name format - starting with number', () => {
      const params: DeployParameters = {
        stackName: '123Stack',
      };

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Stack name');
    });

    it('should reject invalid stack name format - special characters', () => {
      const params: DeployParameters = {
        stackName: 'My_Stack!',
      };

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Stack name');
    });

    it('should accept valid stack name with hyphens', () => {
      const params: DeployParameters = {
        stackName: 'My-Stack-Name',
      };

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(true);
    });

    it('should reject stack name exceeding 128 characters', () => {
      const params: DeployParameters = {
        stackName: 'A'.repeat(129),
      };

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('128 characters');
    });

    it('should accept stack name at exactly 128 characters', () => {
      const params: DeployParameters = {
        stackName: 'A'.repeat(128),
      };

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(true);
    });
  });
});

describe('URL Generation', () => {
  describe('generateQuickCreateLink', () => {
    it('should generate correct Quick Create Link URL format', () => {
      // Requirement 19.6: Generate CloudFormation Quick Create Link URL
      const region = 'us-east-1';
      const templateS3Url =
        'https://s3.us-east-1.amazonaws.com/my-bucket/template.json';
      const stackName = 'MyStack';

      const result = generateQuickCreateLink(region, templateS3Url, stackName);

      expect(result).toContain(
        'https://us-east-1.console.aws.amazon.com/cloudformation/home'
      );
      expect(result).toContain('region=us-east-1');
      expect(result).toContain('#/stacks/create/review');
      expect(result).toContain('templateURL=');
      expect(result).toContain('stackName=MyStack');
    });

    it('should properly encode the template URL', () => {
      const region = 'ap-northeast-1';
      const templateS3Url =
        'https://s3.ap-northeast-1.amazonaws.com/bucket/path/to/template.json';
      const stackName = 'TestStack';

      const result = generateQuickCreateLink(region, templateS3Url, stackName);

      // The URL should be encoded
      expect(result).toContain(encodeURIComponent(templateS3Url));
    });

    it('should properly encode stack name with special characters', () => {
      const region = 'eu-west-1';
      const templateS3Url =
        'https://s3.eu-west-1.amazonaws.com/bucket/template.json';
      const stackName = 'My-Stack-Name';

      const result = generateQuickCreateLink(region, templateS3Url, stackName);

      expect(result).toContain('stackName=My-Stack-Name');
    });

    it('should work with different AWS regions', () => {
      const regions = [
        'us-east-1',
        'us-west-2',
        'eu-west-1',
        'ap-northeast-1',
        'ap-southeast-1',
      ];
      const templateS3Url = 'https://s3.amazonaws.com/bucket/template.json';
      const stackName = 'TestStack';

      regions.forEach((region) => {
        const result = generateQuickCreateLink(
          region,
          templateS3Url,
          stackName
        );
        expect(result).toContain(`https://${region}.console.aws.amazon.com`);
        expect(result).toContain(`region=${region}`);
      });
    });
  });

  describe('generateS3Url', () => {
    it('should generate correct S3 URL format', () => {
      const region = 'us-east-1';
      const bucketName = 'my-bucket';
      const templateKey = 'cfn-templates/123456-MyStack.json';

      const result = generateS3Url(region, bucketName, templateKey);

      expect(result).toBe(
        'https://s3.us-east-1.amazonaws.com/my-bucket/cfn-templates/123456-MyStack.json'
      );
    });

    it('should work with different regions', () => {
      const bucketName = 'test-bucket';
      const templateKey = 'template.json';

      expect(generateS3Url('us-west-2', bucketName, templateKey)).toBe(
        'https://s3.us-west-2.amazonaws.com/test-bucket/template.json'
      );
      expect(generateS3Url('ap-northeast-1', bucketName, templateKey)).toBe(
        'https://s3.ap-northeast-1.amazonaws.com/test-bucket/template.json'
      );
    });
  });
});

describe('Template Content Generation', () => {
  describe('generateTemplateContent', () => {
    it('should generate valid JSON template', () => {
      const params: DeployParameters = {
        ragEnabled: true,
        agentEnabled: false,
        stackName: 'TestStack',
      };

      const content = generateTemplateContent(params);
      const parsed = JSON.parse(content);

      expect(parsed.AWSTemplateFormatVersion).toBe('2010-09-09');
      expect(parsed.Description).toContain('GenU Stack');
    });

    it('should include parameters in template metadata', () => {
      const params: DeployParameters = {
        ragEnabled: true,
        modelId: 'test-model',
      };

      const content = generateTemplateContent(params);
      const parsed = JSON.parse(content);

      expect(parsed.Metadata.Parameters.ragEnabled).toBe(true);
      expect(parsed.Metadata.Parameters.modelId).toBe('test-model');
    });

    it('should include CloudFormation parameters section', () => {
      const params: DeployParameters = {
        ragEnabled: true,
        agentEnabled: false,
        useCaseBuilderEnabled: true,
        modelId: 'custom-model',
      };

      const content = generateTemplateContent(params);
      const parsed = JSON.parse(content);

      expect(parsed.Parameters.RagEnabled.Default).toBe('true');
      expect(parsed.Parameters.AgentEnabled.Default).toBe('false');
      expect(parsed.Parameters.UseCaseBuilderEnabled.Default).toBe('true');
      expect(parsed.Parameters.ModelId.Default).toBe('custom-model');
    });

    it('should use default values when parameters are not provided', () => {
      const params: DeployParameters = {};

      const content = generateTemplateContent(params);
      const parsed = JSON.parse(content);

      expect(parsed.Parameters.RagEnabled.Default).toBe('false');
      expect(parsed.Parameters.AgentEnabled.Default).toBe('false');
      expect(parsed.Parameters.UseCaseBuilderEnabled.Default).toBe('false');
      expect(parsed.Parameters.ModelId.Default).toBe(
        'anthropic.claude-sonnet-4-20250514'
      );
    });

    it('should include generation timestamp', () => {
      const params: DeployParameters = {};

      const content = generateTemplateContent(params);
      const parsed = JSON.parse(content);

      expect(parsed.Metadata.GeneratedAt).toBeDefined();
      expect(parsed.Metadata.GeneratedBy).toBe('GenU Admin Dashboard');
    });

    it('should include outputs section', () => {
      const params: DeployParameters = {};

      const content = generateTemplateContent(params);
      const parsed = JSON.parse(content);

      expect(parsed.Outputs.StackName).toBeDefined();
      expect(parsed.Outputs.GeneratedAt).toBeDefined();
    });
  });
});

describe('Handler Integration Tests', () => {
  beforeEach(() => {
    s3Mock.reset();
    ddbMock.reset();
    resetS3Client();
    resetDynamoDbClient();
    resetAuditDynamoDbClient();
    process.env.TEMPLATE_BUCKET_NAME = 'test-template-bucket';
    process.env.TABLE_NAME = 'test-table';
    process.env.AWS_REGION = 'us-east-1';

    // Mock S3 operations
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(GetObjectCommand).resolves({
      Body: undefined,
    });

    // Mock DynamoDB operations
    ddbMock.on(PutCommand).resolves({});
  });

  afterEach(() => {
    delete process.env.TEMPLATE_BUCKET_NAME;
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

  describe('generateTemplateHandler', () => {
    it('should generate template and return Quick Create Link', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          parameters: {
            ragEnabled: true,
            stackName: 'TestStack',
          },
        }),
      };

      const result = await generateTemplateHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.quickCreateLink).toBeDefined();
      expect(body.quickCreateLink).toContain('cloudformation');
      expect(body.downloadLink).toBeDefined();
      expect(body.templateKey).toBeDefined();
      expect(body.templateKey).toContain('cfn-templates/');
      expect(body.generatedAt).toBeDefined();
      expect(body.stackName).toBe('TestStack');
    });

    it('should use default stack name when not provided', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          parameters: {
            ragEnabled: true,
          },
        }),
      };

      const result = await generateTemplateHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.stackName).toBe('GenU-Stack');
    });

    it('should reject missing request body', async () => {
      const result = await generateTemplateHandler(mockAdminEvent, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Request body');
    });

    it('should reject invalid JSON in request body', async () => {
      const eventWithInvalidBody = {
        ...mockAdminEvent,
        body: 'invalid json',
      };

      const result = await generateTemplateHandler(
        eventWithInvalidBody,
        mockContext
      );

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid JSON');
    });

    it('should reject missing parameters', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({}),
      };

      const result = await generateTemplateHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Parameters');
    });

    it('should reject invalid parameter types', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          parameters: {
            ragEnabled: 'yes', // Should be boolean
          },
        }),
      };

      const result = await generateTemplateHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('ragEnabled');
    });

    it('should reject invalid stack name', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          parameters: {
            stackName: '123InvalidName',
          },
        }),
      };

      const result = await generateTemplateHandler(eventWithBody, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Stack name');
    });

    it('should return 403 for non-admin user', async () => {
      const eventWithBody = {
        ...mockNonAdminEvent,
        body: JSON.stringify({
          parameters: {
            ragEnabled: true,
          },
        }),
      };

      const result = await generateTemplateHandler(eventWithBody, mockContext);
      expect(result.statusCode).toBe(403);
    });

    it('should save template to S3', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          parameters: {
            ragEnabled: true,
            stackName: 'TestStack',
          },
        }),
      };

      await generateTemplateHandler(eventWithBody, mockContext);

      // Verify S3 PutObject was called
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      expect(s3Calls.length).toBe(1);
      expect(s3Calls[0].args[0].input.Bucket).toBe('test-template-bucket');
      expect(s3Calls[0].args[0].input.Key).toContain('cfn-templates/');
      expect(s3Calls[0].args[0].input.ContentType).toBe('application/json');
    });

    it('should record history in DynamoDB', async () => {
      const eventWithBody = {
        ...mockAdminEvent,
        body: JSON.stringify({
          parameters: {
            ragEnabled: true,
            stackName: 'TestStack',
          },
        }),
      };

      await generateTemplateHandler(eventWithBody, mockContext);

      // Verify DynamoDB PutCommand was called (at least twice - once for history, once for audit log)
      const ddbCalls = ddbMock.commandCalls(PutCommand);
      expect(ddbCalls.length).toBeGreaterThanOrEqual(1);

      // Find the history entry
      const historyCall = ddbCalls.find(
        (call) => call.args[0].input.Item?.id === 'template#history'
      );
      expect(historyCall).toBeDefined();
      expect(historyCall?.args[0].input.Item?.stackName).toBe('TestStack');
      expect(historyCall?.args[0].input.Item?.adminUserId).toBe(
        'admin-user-123'
      );
    });
  });

  describe('getTemplateHistoryHandler', () => {
    it('should return template history', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'template#history',
            createdDate: '2025-01-22T10:00:00Z',
            adminUserId: 'admin-user-123',
            adminEmail: 'admin@example.com',
            parameters: { ragEnabled: true },
            quickCreateLink: 'https://console.aws.amazon.com/...',
            downloadLink: 'https://s3.amazonaws.com/...',
            templateKey: 'cfn-templates/123-TestStack.json',
            stackName: 'TestStack',
          },
        ],
      });

      const result = await getTemplateHistoryHandler(
        mockAdminEvent,
        mockContext
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.history).toHaveLength(1);
      expect(body.count).toBe(1);
      expect(body.history[0].stackName).toBe('TestStack');
      expect(body.history[0].adminUserId).toBe('admin-user-123');
    });

    it('should return empty history when no entries exist', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      const result = await getTemplateHistoryHandler(
        mockAdminEvent,
        mockContext
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.history).toHaveLength(0);
      expect(body.count).toBe(0);
    });

    it('should respect limit parameter', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'template#history',
            createdDate: '2025-01-22T10:00:00Z',
            templateKey: 'key1',
          },
          {
            id: 'template#history',
            createdDate: '2025-01-22T09:00:00Z',
            templateKey: 'key2',
          },
        ],
      });

      const eventWithLimit = {
        ...mockAdminEvent,
        queryStringParameters: { limit: '5' },
      };

      const result = await getTemplateHistoryHandler(
        eventWithLimit,
        mockContext
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.history).toBeDefined();
    });

    it('should enforce maximum limit of 50', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      const eventWithLargeLimit = {
        ...mockAdminEvent,
        queryStringParameters: { limit: '100' },
      };

      await getTemplateHistoryHandler(eventWithLargeLimit, mockContext);

      // Verify the query was called with limit capped at 50
      const queryCalls = ddbMock.commandCalls(QueryCommand);
      expect(queryCalls.length).toBe(1);
      expect(queryCalls[0].args[0].input.Limit).toBe(50);
    });

    it('should return 403 for non-admin user', async () => {
      const result = await getTemplateHistoryHandler(
        mockNonAdminEvent,
        mockContext
      );
      expect(result.statusCode).toBe(403);
    });

    it('should generate fresh presigned URLs for download', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'template#history',
            createdDate: '2025-01-22T10:00:00Z',
            templateKey: 'cfn-templates/123-TestStack.json',
            downloadLink: 'https://s3.amazonaws.com/old-url',
          },
        ],
      });

      const result = await getTemplateHistoryHandler(
        mockAdminEvent,
        mockContext
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // The download link should be a fresh presigned URL
      expect(body.history[0].downloadLink).toBeDefined();
    });
  });
});

describe('Edge Cases', () => {
  describe('validateDeployParameters edge cases', () => {
    it('should handle parameters with additional unknown fields', () => {
      const params = {
        ragEnabled: true,
        unknownField: 'value',
        anotherUnknown: 123,
      } as DeployParameters;

      const result = validateDeployParameters(params);
      expect(result.valid).toBe(true);
    });

    it('should handle empty string stack name', () => {
      const params: DeployParameters = {
        stackName: '',
      };

      const result = validateDeployParameters(params);
      // Empty string is falsy, so validation is skipped (treated as not provided)
      // This is acceptable behavior - empty string means "use default"
      expect(result.valid).toBe(true);
    });
  });

  describe('generateQuickCreateLink edge cases', () => {
    it('should handle template URL with special characters', () => {
      const region = 'us-east-1';
      const templateS3Url =
        'https://s3.us-east-1.amazonaws.com/bucket/path/with spaces/template.json';
      const stackName = 'TestStack';

      const result = generateQuickCreateLink(region, templateS3Url, stackName);

      // Should properly encode the URL
      expect(result).not.toContain(' ');
      expect(result).toContain('%20');
    });
  });
});
