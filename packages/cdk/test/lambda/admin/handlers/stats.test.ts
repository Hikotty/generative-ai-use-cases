/**
 * Unit tests for statistics and cost Lambda handler.
 *
 * Tests cover:
 * - Cost calculation logic
 * - Statistics aggregation logic
 * - Date range parsing
 * - Active user calculation
 * - Total questions calculation
 * - Model and use case aggregation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  calculateCost,
  parseDateRange,
  aggregateByModel,
  aggregateByUser,
  aggregateByDate,
  calculateActiveUsers,
  calculateTotalQuestions,
  aggregateModelUsage,
  aggregateUseCaseUsage,
  getCostsHandler,
  getStatsHandler,
  resetDynamoDbClient,
  TokenUsageData,
} from '../../../../lambda/admin/handlers/stats';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Cost Calculation', () => {
  describe('calculateCost', () => {
    it('should calculate cost correctly for Claude 3.5 Sonnet', () => {
      // Requirement 6.2: Calculate cost using model-specific pricing rates
      // Property 12: Cost calculation formula
      const result = calculateCost(
        1000,
        500,
        'anthropic.claude-3-5-sonnet-20241022-v2:0'
      );

      // Expected: (1000/1M)*3 + (500/1M)*15 = 0.003 + 0.0075 = 0.0105
      expect(result.inputCost).toBeCloseTo(0.003, 6);
      expect(result.outputCost).toBeCloseTo(0.0075, 6);
      expect(result.totalCost).toBeCloseTo(0.0105, 6);
    });

    it('should calculate cost correctly for Claude 3 Opus', () => {
      const result = calculateCost(
        2000,
        1000,
        'anthropic.claude-3-opus-20240229-v1:0'
      );

      // Expected: (2000/1M)*15 + (1000/1M)*75 = 0.03 + 0.075 = 0.105
      expect(result.inputCost).toBeCloseTo(0.03, 6);
      expect(result.outputCost).toBeCloseTo(0.075, 6);
      expect(result.totalCost).toBeCloseTo(0.105, 6);
    });

    it('should calculate cost correctly for Claude 3 Haiku', () => {
      const result = calculateCost(
        10000,
        5000,
        'anthropic.claude-3-haiku-20240307-v1:0'
      );

      // Expected: (10000/1M)*0.25 + (5000/1M)*1.25 = 0.0025 + 0.00625 = 0.00875
      expect(result.inputCost).toBeCloseTo(0.0025, 6);
      expect(result.outputCost).toBeCloseTo(0.00625, 6);
      expect(result.totalCost).toBeCloseTo(0.00875, 6);
    });

    it('should use default pricing for unknown model', () => {
      const result = calculateCost(1000, 500, 'unknown-model');

      // Should use Claude 3.5 Sonnet pricing as default
      expect(result.totalCost).toBeCloseTo(0.0105, 6);
    });

    it('should return zero cost for zero tokens', () => {
      const result = calculateCost(
        0,
        0,
        'anthropic.claude-3-5-sonnet-20241022-v2:0'
      );

      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it('should ensure cost is non-negative', () => {
      // Property 12: Cost must be non-negative
      const result = calculateCost(
        1000,
        500,
        'anthropic.claude-3-5-sonnet-20241022-v2:0'
      );

      expect(result.inputCost).toBeGreaterThanOrEqual(0);
      expect(result.outputCost).toBeGreaterThanOrEqual(0);
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Date Range Parsing', () => {
  describe('parseDateRange', () => {
    it('should parse custom date range', () => {
      const result = parseDateRange({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(result.startDate).toBe('2025-01-01');
      expect(result.endDate).toBe('2025-01-31');
    });

    it('should default to current month', () => {
      const result = parseDateRange({});
      const now = new Date();
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];

      expect(result.startDate).toBe(expectedStart);
    });

    it('should parse period=day', () => {
      const result = parseDateRange({ period: 'day' });
      const today = new Date().toISOString().split('T')[0];

      expect(result.startDate).toBe(today);
      expect(result.endDate).toBe(today);
    });

    it('should parse period=week', () => {
      const result = parseDateRange({ period: 'week' });
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const expectedStart = weekAgo.toISOString().split('T')[0];

      expect(result.startDate).toBe(expectedStart);
    });
  });
});

describe('Data Aggregation', () => {
  const sampleUsageData: TokenUsageData[] = [
    {
      date: '2025-01-22',
      userId: 'user1',
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      usecase: 'chat',
      requestCount: 5,
      inputTokens: 1000,
      outputTokens: 500,
    },
    {
      date: '2025-01-22',
      userId: 'user2',
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      usecase: 'rag',
      requestCount: 3,
      inputTokens: 800,
      outputTokens: 400,
    },
    {
      date: '2025-01-23',
      userId: 'user1',
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      usecase: 'chat',
      requestCount: 10,
      inputTokens: 2000,
      outputTokens: 1000,
    },
  ];

  describe('aggregateByModel', () => {
    it('should aggregate token usage by model', () => {
      const result = aggregateByModel(sampleUsageData);

      expect(result.size).toBe(2);

      const sonnetData = result.get(
        'anthropic.claude-3-5-sonnet-20241022-v2:0'
      );
      expect(sonnetData).toBeDefined();
      expect(sonnetData?.inputTokens).toBe(1800); // 1000 + 800
      expect(sonnetData?.outputTokens).toBe(900); // 500 + 400
      expect(sonnetData?.requests).toBe(8); // 5 + 3

      const haikuData = result.get('anthropic.claude-3-haiku-20240307-v1:0');
      expect(haikuData).toBeDefined();
      expect(haikuData?.inputTokens).toBe(2000);
      expect(haikuData?.outputTokens).toBe(1000);
      expect(haikuData?.requests).toBe(10);
    });
  });

  describe('aggregateByUser', () => {
    it('should aggregate token usage by user', () => {
      const result = aggregateByUser(sampleUsageData);

      expect(result.size).toBe(2);

      const user1Data = result.get('user1');
      expect(user1Data).toBeDefined();
      expect(user1Data?.inputTokens).toBe(3000); // 1000 + 2000
      expect(user1Data?.outputTokens).toBe(1500); // 500 + 1000
      expect(user1Data?.requests).toBe(15); // 5 + 10

      const user2Data = result.get('user2');
      expect(user2Data).toBeDefined();
      expect(user2Data?.inputTokens).toBe(800);
      expect(user2Data?.outputTokens).toBe(400);
      expect(user2Data?.requests).toBe(3);
    });
  });

  describe('aggregateByDate', () => {
    it('should aggregate token usage by date', () => {
      const result = aggregateByDate(sampleUsageData);

      expect(result.size).toBe(2);

      const jan22Data = result.get('2025-01-22');
      expect(jan22Data).toBeDefined();
      expect(jan22Data?.inputTokens).toBe(1800); // 1000 + 800
      expect(jan22Data?.outputTokens).toBe(900); // 500 + 400

      const jan23Data = result.get('2025-01-23');
      expect(jan23Data).toBeDefined();
      expect(jan23Data?.inputTokens).toBe(2000);
      expect(jan23Data?.outputTokens).toBe(1000);
    });
  });
});

describe('Statistics Calculation', () => {
  const sampleUsageData: TokenUsageData[] = [
    {
      date: '2025-01-22',
      userId: 'user1',
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      usecase: 'chat',
      requestCount: 5,
      inputTokens: 1000,
      outputTokens: 500,
    },
    {
      date: '2025-01-22',
      userId: 'user2',
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      usecase: 'rag',
      requestCount: 3,
      inputTokens: 800,
      outputTokens: 400,
    },
    {
      date: '2025-01-23',
      userId: 'user1',
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      usecase: 'chat',
      requestCount: 10,
      inputTokens: 2000,
      outputTokens: 1000,
    },
    {
      date: '2025-01-23',
      userId: 'user3',
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      usecase: 'agent',
      requestCount: 2,
      inputTokens: 500,
      outputTokens: 250,
    },
  ];

  describe('calculateActiveUsers', () => {
    it('should count unique users', () => {
      // Requirement 7.2: Calculate active users (unique userIds)
      // Property 13: Active user count = unique userId count
      const result = calculateActiveUsers(sampleUsageData);

      expect(result).toBe(3); // user1, user2, user3
    });

    it('should return 0 for empty data', () => {
      const result = calculateActiveUsers([]);

      expect(result).toBe(0);
    });

    it('should handle duplicate users correctly', () => {
      const data: TokenUsageData[] = [
        {
          date: '2025-01-22',
          userId: 'user1',
          modelId: 'model1',
          requestCount: 1,
          inputTokens: 100,
          outputTokens: 50,
        },
        {
          date: '2025-01-23',
          userId: 'user1',
          modelId: 'model1',
          requestCount: 1,
          inputTokens: 100,
          outputTokens: 50,
        },
      ];

      const result = calculateActiveUsers(data);

      expect(result).toBe(1); // Only one unique user
    });
  });

  describe('calculateTotalQuestions', () => {
    it('should sum all request counts', () => {
      // Requirement 7.3: Calculate total questions (total message count)
      // Property 14: Total questions = sum of all request counts
      const result = calculateTotalQuestions(sampleUsageData);

      expect(result).toBe(20); // 5 + 3 + 10 + 2
    });

    it('should return 0 for empty data', () => {
      const result = calculateTotalQuestions([]);

      expect(result).toBe(0);
    });
  });

  describe('aggregateModelUsage', () => {
    it('should aggregate and sort models by usage', () => {
      // Requirement 7.4: Display popular models ranking (by usage count)
      const result = aggregateModelUsage(sampleUsageData);

      expect(result.length).toBe(2);

      // Should be sorted by request count descending
      expect(result[0].modelId).toBe('anthropic.claude-3-haiku-20240307-v1:0');
      expect(result[0].requestCount).toBe(12); // 10 + 2
      expect(result[0].totalTokens).toBe(3750); // (2000+1000) + (500+250)

      expect(result[1].modelId).toBe(
        'anthropic.claude-3-5-sonnet-20241022-v2:0'
      );
      expect(result[1].requestCount).toBe(8); // 5 + 3
      expect(result[1].totalTokens).toBe(2700); // (1000+500) + (800+400)
    });
  });

  describe('aggregateUseCaseUsage', () => {
    it('should aggregate and sort use cases by usage', () => {
      // Requirement 7.5: Display use case usage frequency (by usage count)
      const result = aggregateUseCaseUsage(sampleUsageData);

      expect(result.length).toBe(3);

      // Should be sorted by request count descending
      expect(result[0].usecase).toBe('chat');
      expect(result[0].requestCount).toBe(15); // 5 + 10

      expect(result[1].usecase).toBe('rag');
      expect(result[1].requestCount).toBe(3);

      expect(result[2].usecase).toBe('agent');
      expect(result[2].requestCount).toBe(2);
    });

    it('should handle missing use case', () => {
      const data: TokenUsageData[] = [
        {
          date: '2025-01-22',
          userId: 'user1',
          modelId: 'model1',
          requestCount: 5,
          inputTokens: 1000,
          outputTokens: 500,
        },
      ];

      const result = aggregateUseCaseUsage(data);

      expect(result.length).toBe(0);
    });
  });
});

describe('Handler Integration Tests', () => {
  beforeEach(() => {
    ddbMock.reset();
    resetDynamoDbClient();
    process.env.STATS_TABLE_NAME = 'test-stats-table';
    process.env.MAIN_TABLE_NAME = 'test-main-table';
  });

  afterEach(() => {
    delete process.env.STATS_TABLE_NAME;
    delete process.env.MAIN_TABLE_NAME;
  });

  const mockEvent = {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const mockContext = {
    awsRequestId: 'test-request-id',
  } as Context;

  describe('getCostsHandler', () => {
    it('should return cost statistics', async () => {
      // Mock DynamoDB response
      ddbMock.on(ScanCommand).resolves({
        Items: [
          {
            date: '2025-01-22',
            userId: 'user1',
            modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            usecase: 'chat',
            requestCount: 5,
            inputTokens: 1000,
            outputTokens: 500,
          },
        ],
      });

      const result = await getCostsHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.totalCost).toBeGreaterThan(0);
      expect(body.byModel).toBeDefined();
      expect(body.byUser).toBeDefined();
      expect(body.dailyCosts).toBeDefined();
      expect(body.startDate).toBeDefined();
      expect(body.endDate).toBeDefined();
    });

    it('should return 403 for non-admin user', async () => {
      const nonAdminEvent = {
        ...mockEvent,
        requestContext: {
          authorizer: {
            claims: {
              'custom:role': 'user',
              'cognito:username': 'user-123',
            },
          },
        },
      };

      const result = await getCostsHandler(nonAdminEvent, mockContext);

      expect(result.statusCode).toBe(403);
    });
  });

  describe('getStatsHandler', () => {
    it('should return usage statistics', async () => {
      // Mock DynamoDB response
      ddbMock.on(ScanCommand).resolves({
        Items: [
          {
            date: '2025-01-22',
            userId: 'user1',
            modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            usecase: 'chat',
            requestCount: 5,
            inputTokens: 1000,
            outputTokens: 500,
          },
          {
            date: '2025-01-22',
            userId: 'user2',
            modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
            usecase: 'rag',
            requestCount: 3,
            inputTokens: 800,
            outputTokens: 400,
          },
        ],
      });

      const result = await getStatsHandler(mockEvent, mockContext);

      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.activeUsers).toBe(2);
      expect(body.totalQuestions).toBe(8);
      expect(body.popularModels).toBeDefined();
      expect(body.useCaseFrequency).toBeDefined();
      expect(body.startDate).toBeDefined();
      expect(body.endDate).toBeDefined();
    });

    it('should return 403 for non-admin user', async () => {
      const nonAdminEvent = {
        ...mockEvent,
        requestContext: {
          authorizer: {
            claims: {
              'cognito:username': 'user-123',
            },
          },
        },
      };

      const result = await getStatsHandler(nonAdminEvent, mockContext);

      expect(result.statusCode).toBe(403);
    });
  });
});
