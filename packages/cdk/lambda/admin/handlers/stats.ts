/**
 * Statistics and cost Lambda handler for admin dashboard.
 *
 * This module provides handlers for cost monitoring and usage statistics:
 * - GET /admin/costs: Retrieve cost statistics with model-based pricing
 * - GET /admin/stats: Retrieve usage statistics (active users, total questions)
 *
 * Requirements:
 * - 6.1: Retrieve token usage data from Stats Table
 * - 6.2: Calculate cost estimates using model-specific pricing rates
 * - 6.3: Display current month total cost estimate
 * - 6.4: Display cost breakdown by model (pie chart)
 * - 6.5: Display cost ranking by user (top 10)
 * - 6.6: Display daily cost trend (past 30 days, line chart)
 * - 6.7: Display weekly cost trend (past 12 weeks, bar chart)
 * - 6.8: Display monthly cost trend (past 12 months, bar chart)
 * - 7.1: Retrieve data from Main Table and Stats Table
 * - 7.2: Calculate active users (unique userIds with at least one message)
 * - 7.3: Calculate total questions (total message count)
 * - 7.4: Display popular models ranking (by usage count)
 * - 7.5: Display use case usage frequency (by usage count)
 * - 10.2: Query Stats Table by date range
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { checkAdminRole, getAdminUserId } from '../utils/roleCheck';
import {
  createForbiddenResponse,
  createSuccessResponse,
  handleError,
  logError,
} from '../utils/errorResponse';

// DynamoDB client singleton
let dynamoDbClient: DynamoDBDocumentClient | null = null;

/**
 * Gets or creates the DynamoDB Document client.
 */
function getDynamoDbClient(): DynamoDBDocumentClient {
  if (!dynamoDbClient) {
    const client = new DynamoDBClient({});
    dynamoDbClient = DynamoDBDocumentClient.from(client);
  }
  return dynamoDbClient;
}

/**
 * Gets the Stats Table name from environment variable.
 */
function getStatsTableName(): string {
  const tableName = process.env.STATS_TABLE_NAME;
  if (!tableName) {
    throw new Error('STATS_TABLE_NAME environment variable is not set');
  }
  return tableName;
}

/**
 * Gets the Main Table name from environment variable.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getMainTableName(): string {
  const tableName = process.env.MAIN_TABLE_NAME;
  if (!tableName) {
    throw new Error('MAIN_TABLE_NAME environment variable is not set');
  }
  return tableName;
}

/**
 * Model pricing rates (USD per 1 million tokens).
 *
 * Based on AWS Bedrock pricing as of 2025.
 * Requirement 6.2: Apply model-specific pricing rates to calculate costs
 */
export const MODEL_PRICING: Record<
  string,
  { inputPer1M: number; outputPer1M: number }
> = {
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
  },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
  },
  'anthropic.claude-3-opus-20240229-v1:0': {
    inputPer1M: 15.0,
    outputPer1M: 75.0,
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    inputPer1M: 0.25,
    outputPer1M: 1.25,
  },
  'anthropic.claude-v2:1': {
    inputPer1M: 8.0,
    outputPer1M: 24.0,
  },
  'anthropic.claude-v2': {
    inputPer1M: 8.0,
    outputPer1M: 24.0,
  },
  'anthropic.claude-instant-v1': {
    inputPer1M: 0.8,
    outputPer1M: 2.4,
  },
  'amazon.titan-text-express-v1': {
    inputPer1M: 0.2,
    outputPer1M: 0.6,
  },
  'amazon.titan-text-lite-v1': {
    inputPer1M: 0.15,
    outputPer1M: 0.2,
  },
  'cohere.command-text-v14': {
    inputPer1M: 1.5,
    outputPer1M: 2.0,
  },
  'cohere.command-light-text-v14': {
    inputPer1M: 0.3,
    outputPer1M: 0.6,
  },
  'meta.llama3-70b-instruct-v1:0': {
    inputPer1M: 0.99,
    outputPer1M: 0.99,
  },
  'meta.llama3-8b-instruct-v1:0': {
    inputPer1M: 0.3,
    outputPer1M: 0.6,
  },
  'mistral.mistral-7b-instruct-v0:2': {
    inputPer1M: 0.15,
    outputPer1M: 0.2,
  },
  'mistral.mixtral-8x7b-instruct-v0:1': {
    inputPer1M: 0.45,
    outputPer1M: 0.7,
  },
  'mistral.mistral-large-2402-v1:0': {
    inputPer1M: 4.0,
    outputPer1M: 12.0,
  },
};

/**
 * Token usage data from Stats Table.
 */
export interface TokenUsageData {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** User ID */
  userId: string;
  /** Model ID */
  modelId: string;
  /** Use case */
  usecase?: string;
  /** Number of requests */
  requestCount: number;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Cache read input tokens */
  cacheReadInputTokens?: number;
  /** Cache write input tokens */
  cacheWriteInputTokens?: number;
}

/**
 * Cost calculation result.
 */
export interface CostCalculation {
  /** Input token cost in USD */
  inputCost: number;
  /** Output token cost in USD */
  outputCost: number;
  /** Total cost in USD */
  totalCost: number;
}

/**
 * Calculates cost from token usage.
 *
 * Requirement 6.2: Calculate cost estimates using model-specific pricing rates
 * Property 12: Cost calculation formula validation
 *
 * Formula: cost = (inputTokens / 1,000,000) * inputRate + (outputTokens / 1,000,000) * outputRate
 *
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param modelId - Model ID for pricing lookup
 * @returns Cost calculation result
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: string
): CostCalculation {
  // Get pricing for model (default to Claude 3.5 Sonnet if not found)
  const pricing =
    MODEL_PRICING[modelId] ||
    MODEL_PRICING['anthropic.claude-3-5-sonnet-20241022-v2:0'];

  // Calculate costs (per 1 million tokens)
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
  };
}

/**
 * Cost breakdown by model.
 */
export interface ModelCostBreakdown {
  /** Model ID */
  modelId: string;
  /** Total cost in USD */
  cost: number;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Number of requests */
  requestCount: number;
}

/**
 * Cost breakdown by user.
 */
export interface UserCostBreakdown {
  /** User ID */
  userId: string;
  /** Total cost in USD */
  cost: number;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Number of requests */
  requestCount: number;
}

/**
 * Daily cost data point.
 */
export interface DailyCostData {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Total cost in USD */
  cost: number;
}

/**
 * Cost statistics response.
 */
export interface CostStatisticsResponse {
  /** Total cost for the period in USD */
  totalCost: number;
  /** Cost breakdown by model */
  byModel: ModelCostBreakdown[];
  /** Cost breakdown by user (top 10) */
  byUser: UserCostBreakdown[];
  /** Daily cost trend */
  dailyCosts: DailyCostData[];
  /** Period start date */
  startDate: string;
  /** Period end date */
  endDate: string;
}

/**
 * Parses date range from query parameters.
 *
 * Supports:
 * - period=month (default): Current month
 * - period=week: Past 7 days
 * - period=day: Today
 * - startDate & endDate: Custom range
 *
 * @param queryParams - Query string parameters
 * @returns Start and end dates in YYYY-MM-DD format
 */
export function parseDateRange(
  queryParams: Record<string, string | undefined>
): {
  startDate: string;
  endDate: string;
} {
  const period = queryParams.period || 'month';
  const now = new Date();

  if (queryParams.startDate && queryParams.endDate) {
    return {
      startDate: queryParams.startDate,
      endDate: queryParams.endDate,
    };
  }

  let startDate: Date;
  const endDate = now;

  switch (period) {
    case 'day':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Retrieves token usage data from Stats Table.
 *
 * Requirement 6.1: Retrieve token usage data from Stats Table
 * Requirement 10.2: Query Stats Table by date range
 *
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Array of token usage data
 */
export async function getTokenUsageData(
  startDate: string,
  endDate: string
): Promise<TokenUsageData[]> {
  const client = getDynamoDbClient();
  const tableName = getStatsTableName();

  const usageData: TokenUsageData[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const scanInput: ScanCommandInput = {
      TableName: tableName,
      Limit: 1000,
    };

    // Build filter expression for date range
    const filterExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, string> = {};

    // Filter by date range (PK is date in YYYY-MM-DD format)
    filterExpressions.push('#date BETWEEN :startDate AND :endDate');
    expressionAttributeNames['#date'] = 'date';
    expressionAttributeValues[':startDate'] = startDate;
    expressionAttributeValues[':endDate'] = endDate;

    scanInput.FilterExpression = filterExpressions.join(' AND ');
    scanInput.ExpressionAttributeNames = expressionAttributeNames;
    scanInput.ExpressionAttributeValues = expressionAttributeValues;

    if (lastEvaluatedKey) {
      scanInput.ExclusiveStartKey = lastEvaluatedKey;
    }

    const response = await client.send(new ScanCommand(scanInput));

    if (response.Items) {
      for (const item of response.Items) {
        usageData.push({
          date: (item.date as string) || '',
          userId: (item.userId as string) || '',
          modelId: (item.modelId as string) || '',
          usecase: item.usecase as string | undefined,
          requestCount: (item.requestCount as number) || 0,
          inputTokens: (item.inputTokens as number) || 0,
          outputTokens: (item.outputTokens as number) || 0,
          cacheReadInputTokens: item.cacheReadInputTokens as number | undefined,
          cacheWriteInputTokens: item.cacheWriteInputTokens as
            | number
            | undefined,
        });
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return usageData;
}

/**
 * Aggregates token usage data by model.
 *
 * @param usageData - Array of token usage data
 * @returns Map of model ID to aggregated data
 */
export function aggregateByModel(
  usageData: TokenUsageData[]
): Map<
  string,
  { inputTokens: number; outputTokens: number; requests: number }
> {
  const modelMap = new Map<
    string,
    { inputTokens: number; outputTokens: number; requests: number }
  >();

  for (const data of usageData) {
    const existing = modelMap.get(data.modelId) || {
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
    };

    modelMap.set(data.modelId, {
      inputTokens: existing.inputTokens + data.inputTokens,
      outputTokens: existing.outputTokens + data.outputTokens,
      requests: existing.requests + data.requestCount,
    });
  }

  return modelMap;
}

/**
 * Aggregates token usage data by user.
 *
 * @param usageData - Array of token usage data
 * @returns Map of user ID to aggregated data
 */
export function aggregateByUser(
  usageData: TokenUsageData[]
): Map<
  string,
  { inputTokens: number; outputTokens: number; requests: number }
> {
  const userMap = new Map<
    string,
    { inputTokens: number; outputTokens: number; requests: number }
  >();

  for (const data of usageData) {
    const existing = userMap.get(data.userId) || {
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
    };

    userMap.set(data.userId, {
      inputTokens: existing.inputTokens + data.inputTokens,
      outputTokens: existing.outputTokens + data.outputTokens,
      requests: existing.requests + data.requestCount,
    });
  }

  return userMap;
}

/**
 * Aggregates token usage data by date.
 *
 * @param usageData - Array of token usage data
 * @returns Map of date to aggregated data
 */
export function aggregateByDate(
  usageData: TokenUsageData[]
): Map<string, { inputTokens: number; outputTokens: number }> {
  const dateMap = new Map<
    string,
    { inputTokens: number; outputTokens: number }
  >();

  for (const data of usageData) {
    const existing = dateMap.get(data.date) || {
      inputTokens: 0,
      outputTokens: 0,
    };

    dateMap.set(data.date, {
      inputTokens: existing.inputTokens + data.inputTokens,
      outputTokens: existing.outputTokens + data.outputTokens,
    });
  }

  return dateMap;
}

/**
 * Handler for GET /admin/costs endpoint.
 *
 * Retrieves cost statistics with model-based pricing.
 *
 * Query parameters:
 * - period: Time period (day, week, month) (default: month)
 * - startDate: Custom start date in YYYY-MM-DD format (optional)
 * - endDate: Custom end date in YYYY-MM-DD format (optional)
 *
 * Requirements:
 * - 6.1: Retrieve token usage data from Stats Table
 * - 6.2: Calculate cost estimates using model-specific pricing rates
 * - 6.3: Display current month total cost estimate
 * - 6.4: Display cost breakdown by model
 * - 6.5: Display cost ranking by user (top 10)
 * - 6.6: Display daily cost trend
 * - 10.2: Query Stats Table by date range
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with cost statistics
 */
export async function getCostsHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const { startDate, endDate } = parseDateRange(queryParams);

    // Retrieve token usage data
    const usageData = await getTokenUsageData(startDate, endDate);

    // Aggregate by model
    const modelAggregates = aggregateByModel(usageData);
    const byModel: ModelCostBreakdown[] = [];
    let totalCost = 0;

    for (const [modelId, data] of modelAggregates.entries()) {
      const cost = calculateCost(data.inputTokens, data.outputTokens, modelId);
      byModel.push({
        modelId,
        cost: cost.totalCost,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        requestCount: data.requests,
      });
      totalCost += cost.totalCost;
    }

    // Sort by cost descending
    byModel.sort((a, b) => b.cost - a.cost);

    // Aggregate by user
    const userAggregates = aggregateByUser(usageData);
    const byUser: UserCostBreakdown[] = [];

    for (const [userId, data] of userAggregates.entries()) {
      // Calculate cost using the most common model for this user
      // For simplicity, we'll use a weighted average approach
      const userUsageData = usageData.filter((u) => u.userId === userId);
      let userTotalCost = 0;

      for (const usage of userUsageData) {
        const cost = calculateCost(
          usage.inputTokens,
          usage.outputTokens,
          usage.modelId
        );
        userTotalCost += cost.totalCost;
      }

      byUser.push({
        userId,
        cost: userTotalCost,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        requestCount: data.requests,
      });
    }

    // Sort by cost descending and take top 10
    byUser.sort((a, b) => b.cost - a.cost);
    const topUsers = byUser.slice(0, 10);

    // Aggregate by date for daily costs
    const dateAggregates = aggregateByDate(usageData);
    const dailyCosts: DailyCostData[] = [];

    for (const [date] of dateAggregates.entries()) {
      // Calculate cost using weighted average of all models used on this date
      const dateUsageData = usageData.filter((u) => u.date === date);
      let dateTotalCost = 0;

      for (const usage of dateUsageData) {
        const cost = calculateCost(
          usage.inputTokens,
          usage.outputTokens,
          usage.modelId
        );
        dateTotalCost += cost.totalCost;
      }

      dailyCosts.push({
        date,
        cost: dateTotalCost,
      });
    }

    // Sort by date ascending
    dailyCosts.sort((a, b) => a.date.localeCompare(b.date));

    const response: CostStatisticsResponse = {
      totalCost,
      byModel,
      byUser: topUsers,
      dailyCosts,
      startDate,
      endDate,
    };

    return createSuccessResponse(response);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Model usage statistics.
 */
export interface ModelUsageStats {
  /** Model ID */
  modelId: string;
  /** Number of requests */
  requestCount: number;
  /** Total tokens (input + output) */
  totalTokens: number;
}

/**
 * Use case usage statistics.
 */
export interface UseCaseUsageStats {
  /** Use case name */
  usecase: string;
  /** Number of requests */
  requestCount: number;
}

/**
 * Usage statistics response.
 */
export interface UsageStatisticsResponse {
  /** Number of active users (unique userIds with at least one message) */
  activeUsers: number;
  /** Total number of questions/messages */
  totalQuestions: number;
  /** Popular models ranking (by usage count) */
  popularModels: ModelUsageStats[];
  /** Use case usage frequency (by usage count) */
  useCaseFrequency: UseCaseUsageStats[];
  /** Period start date */
  startDate: string;
  /** Period end date */
  endDate: string;
}

/**
 * Calculates the number of active users.
 *
 * Requirement 7.2: Calculate active users (unique userIds with at least one message)
 * Property 13: Active user count = unique userId count
 *
 * @param usageData - Array of token usage data
 * @returns Number of unique users
 */
export function calculateActiveUsers(usageData: TokenUsageData[]): number {
  const uniqueUsers = new Set<string>();

  for (const data of usageData) {
    if (data.userId) {
      uniqueUsers.add(data.userId);
    }
  }

  return uniqueUsers.size;
}

/**
 * Calculates the total number of questions/messages.
 *
 * Requirement 7.3: Calculate total questions (total message count)
 * Property 14: Total questions = sum of all request counts
 *
 * @param usageData - Array of token usage data
 * @returns Total number of requests
 */
export function calculateTotalQuestions(usageData: TokenUsageData[]): number {
  let total = 0;

  for (const data of usageData) {
    total += data.requestCount;
  }

  return total;
}

/**
 * Aggregates usage data by model for ranking.
 *
 * Requirement 7.4: Display popular models ranking (by usage count)
 *
 * @param usageData - Array of token usage data
 * @returns Array of model usage statistics, sorted by request count descending
 */
export function aggregateModelUsage(
  usageData: TokenUsageData[]
): ModelUsageStats[] {
  const modelMap = new Map<
    string,
    { requestCount: number; totalTokens: number }
  >();

  for (const data of usageData) {
    const existing = modelMap.get(data.modelId) || {
      requestCount: 0,
      totalTokens: 0,
    };

    modelMap.set(data.modelId, {
      requestCount: existing.requestCount + data.requestCount,
      totalTokens: existing.totalTokens + data.inputTokens + data.outputTokens,
    });
  }

  const models: ModelUsageStats[] = [];
  for (const [modelId, stats] of modelMap.entries()) {
    models.push({
      modelId,
      requestCount: stats.requestCount,
      totalTokens: stats.totalTokens,
    });
  }

  // Sort by request count descending
  models.sort((a, b) => b.requestCount - a.requestCount);

  return models;
}

/**
 * Aggregates usage data by use case for ranking.
 *
 * Requirement 7.5: Display use case usage frequency (by usage count)
 *
 * @param usageData - Array of token usage data
 * @returns Array of use case usage statistics, sorted by request count descending
 */
export function aggregateUseCaseUsage(
  usageData: TokenUsageData[]
): UseCaseUsageStats[] {
  const useCaseMap = new Map<string, number>();

  for (const data of usageData) {
    if (data.usecase) {
      const existing = useCaseMap.get(data.usecase) || 0;
      useCaseMap.set(data.usecase, existing + data.requestCount);
    }
  }

  const useCases: UseCaseUsageStats[] = [];
  for (const [usecase, requestCount] of useCaseMap.entries()) {
    useCases.push({
      usecase,
      requestCount,
    });
  }

  // Sort by request count descending
  useCases.sort((a, b) => b.requestCount - a.requestCount);

  return useCases;
}

/**
 * Handler for GET /admin/stats endpoint.
 *
 * Retrieves usage statistics (active users, total questions, model ranking, use case frequency).
 *
 * Query parameters:
 * - period: Time period (day, week, month) (default: month)
 * - startDate: Custom start date in YYYY-MM-DD format (optional)
 * - endDate: Custom end date in YYYY-MM-DD format (optional)
 *
 * Requirements:
 * - 7.1: Retrieve data from Main Table and Stats Table
 * - 7.2: Calculate active users (unique userIds with at least one message)
 * - 7.3: Calculate total questions (total message count)
 * - 7.4: Display popular models ranking (by usage count)
 * - 7.5: Display use case usage frequency (by usage count)
 * - 10.2: Query Stats Table by date range
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with usage statistics
 */
export async function getStatsHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const { startDate, endDate } = parseDateRange(queryParams);

    // Retrieve token usage data
    const usageData = await getTokenUsageData(startDate, endDate);

    // Calculate statistics
    const activeUsers = calculateActiveUsers(usageData);
    const totalQuestions = calculateTotalQuestions(usageData);
    const popularModels = aggregateModelUsage(usageData);
    const useCaseFrequency = aggregateUseCaseUsage(usageData);

    const response: UsageStatisticsResponse = {
      activeUsers,
      totalQuestions,
      popularModels,
      useCaseFrequency,
      startDate,
      endDate,
    };

    return createSuccessResponse(response);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Allows setting a custom DynamoDB client for testing purposes.
 *
 * @param client - DynamoDB Document client to use
 */
export function setDynamoDbClient(client: DynamoDBDocumentClient): void {
  dynamoDbClient = client;
}

/**
 * Resets the DynamoDB client (useful for testing).
 */
export function resetDynamoDbClient(): void {
  dynamoDbClient = null;
}
