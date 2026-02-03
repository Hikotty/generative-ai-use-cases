/**
 * Log viewer Lambda handler for admin dashboard.
 *
 * This module provides handlers for viewing usage logs:
 * - GET /admin/logs: Retrieve usage logs with filtering and pagination
 *
 * Requirements:
 * - 4.1: Display message data from Main Table
 * - 4.2: Display timestamp, userId, prompt, response for each log
 * - 4.3: Filter by date range
 * - 4.4: Filter by userId
 * - 4.5: Pagination with 100 logs per page
 * - 10.1: Query Main Table for logs
 * - 10.3: Use KeyConditionExpression for date range filtering
 * - 10.4: Use FilterExpression for user filtering
 * - 10.5: Use LastEvaluatedKey for pagination
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
  createBadRequestResponse,
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
 * Gets the Main Table name from environment variable.
 */
function getMainTableName(): string {
  const tableName = process.env.MAIN_TABLE_NAME;
  if (!tableName) {
    throw new Error('MAIN_TABLE_NAME environment variable is not set');
  }
  return tableName;
}

/**
 * Log entry response structure for API.
 */
export interface LogEntry {
  /** Timestamp in ISO 8601 format */
  timestamp: string;
  /** User ID */
  userId: string;
  /** Chat ID */
  chatId: string;
  /** Message ID */
  messageId: string;
  /** User prompt (first 100 characters) */
  prompt: string;
  /** Assistant response (first 100 characters) */
  response: string;
  /** Model used */
  model?: string;
  /** Use case */
  usecase?: string;
  /** Token usage metadata */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * List logs response structure.
 */
export interface ListLogsResponse {
  /** Array of log entries */
  logs: LogEntry[];
  /** Pagination token for next page (if more results exist) */
  nextToken?: string;
  /** Total count of logs returned in this page */
  count: number;
}

/**
 * Truncates text to specified length with ellipsis.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length (default: 100)
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * Converts DynamoDB timestamp to ISO 8601 format.
 *
 * DynamoDB stores timestamps as strings in format: "<timestamp>#<uuid>"
 * where timestamp is milliseconds since epoch.
 *
 * @param createdDate - DynamoDB createdDate field
 * @returns ISO 8601 formatted date string
 */
export function convertTimestamp(createdDate: string): string {
  try {
    // Extract timestamp from format: "1234567890123#uuid"
    const timestamp = createdDate.split('#')[0];
    const date = new Date(parseInt(timestamp, 10));
    return date.toISOString();
  } catch {
    return createdDate;
  }
}

/**
 * Checks if a timestamp is within the specified date range.
 *
 * @param timestamp - ISO 8601 timestamp
 * @param startDate - Start date (ISO 8601 or YYYY-MM-DD)
 * @param endDate - End date (ISO 8601 or YYYY-MM-DD)
 * @returns true if within range, false otherwise
 */
export function isWithinDateRange(
  timestamp: string,
  startDate?: string,
  endDate?: string
): boolean {
  if (!startDate && !endDate) {
    return true;
  }

  const date = new Date(timestamp);

  if (startDate) {
    const start = new Date(startDate);
    if (date < start) {
      return false;
    }
  }

  if (endDate) {
    // Add one day to endDate to include the entire end date
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    if (date >= end) {
      return false;
    }
  }

  return true;
}

/**
 * Converts DynamoDB item to LogEntry.
 *
 * Handles both message items and extracts relevant information.
 *
 * @param item - DynamoDB item
 * @returns LogEntry or null if item is not a message
 */
export function convertToLogEntry(
  item: Record<string, unknown>
): LogEntry | null {
  // Check if this is a message item (has messageId and role)
  if (!item.messageId || !item.role) {
    return null;
  }

  // Extract chat ID from the id field (format: "chat#<uuid>")
  const chatId =
    typeof item.id === 'string' ? item.id.replace('chat#', '') : '';

  // Extract user ID from userId field (format: "user#<uuid>")
  const userId =
    typeof item.userId === 'string' ? item.userId.replace('user#', '') : '';

  // Convert timestamp
  const timestamp = convertTimestamp(
    typeof item.createdDate === 'string' ? item.createdDate : ''
  );

  // Extract prompt and response based on role
  let prompt = '';
  let response = '';

  if (item.role === 'user') {
    prompt = truncateText(typeof item.content === 'string' ? item.content : '');
  } else if (item.role === 'assistant') {
    response = truncateText(
      typeof item.content === 'string' ? item.content : ''
    );
  }

  // Extract token usage if available
  let tokenUsage;
  if (item.metadata && typeof item.metadata === 'object') {
    const metadata = item.metadata as Record<string, unknown>;
    if (metadata.usage && typeof metadata.usage === 'object') {
      const usage = metadata.usage as Record<string, unknown>;
      tokenUsage = {
        inputTokens:
          typeof usage.inputTokens === 'number' ? usage.inputTokens : 0,
        outputTokens:
          typeof usage.outputTokens === 'number' ? usage.outputTokens : 0,
        totalTokens:
          typeof usage.totalTokens === 'number' ? usage.totalTokens : 0,
      };
    }
  }

  return {
    timestamp,
    userId,
    chatId,
    messageId: typeof item.messageId === 'string' ? item.messageId : '',
    prompt,
    response,
    model: typeof item.llmType === 'string' ? item.llmType : undefined,
    usecase: typeof item.usecase === 'string' ? item.usecase : undefined,
    tokenUsage,
  };
}

/**
 * Handler for GET /admin/logs endpoint.
 *
 * Retrieves usage logs from DynamoDB Main Table with filtering and pagination.
 *
 * Query parameters:
 * - startDate: Start date for filtering (ISO 8601 or YYYY-MM-DD) (optional)
 * - endDate: End date for filtering (ISO 8601 or YYYY-MM-DD) (optional)
 * - userId: User ID for filtering (optional)
 * - nextToken: Pagination token from previous response (optional)
 * - limit: Number of logs per page (default: 100, max: 100)
 *
 * Requirements:
 * - 4.1: Display message data from Main Table
 * - 4.2: Display timestamp, userId, prompt, response
 * - 4.3: Filter by date range
 * - 4.4: Filter by userId
 * - 4.5: Pagination with 100 logs per page
 * - 10.1: Query Main Table
 * - 10.4: Use FilterExpression for user filtering
 * - 10.5: Use LastEvaluatedKey for pagination
 *
 * Note: Due to DynamoDB's data model where messages are stored with chat# as PK,
 * we need to use Scan with FilterExpression for cross-chat queries.
 * For production use with large datasets, consider adding a GSI with userId as PK.
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with log entries
 */
export async function listLogsHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const client = getDynamoDbClient();
    const tableName = getMainTableName();

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const startDate = queryParams.startDate;
    const endDate = queryParams.endDate;
    const userIdFilter = queryParams.userId;
    const nextToken = queryParams.nextToken;
    const requestedLimit = parseInt(queryParams.limit || '100', 10);

    // Enforce maximum limit of 100 logs per page (Requirement 4.5)
    const limit = Math.min(Math.max(1, requestedLimit), 100);

    // Build Scan command
    // Note: We use Scan because messages are distributed across multiple chat# partition keys
    // For better performance with large datasets, consider adding a GSI with userId as PK
    const scanInput: ScanCommandInput = {
      TableName: tableName,
      Limit: limit * 2, // Fetch more to account for filtering
    };

    // Build FilterExpression
    const filterExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, string> = {};

    // Filter for message items only (items with messageId)
    filterExpressions.push('attribute_exists(#messageId)');
    expressionAttributeNames['#messageId'] = 'messageId';

    // Add user filter if provided (Requirement 4.4, 10.4)
    if (userIdFilter) {
      filterExpressions.push('contains(#userId, :userId)');
      expressionAttributeNames['#userId'] = 'userId';
      expressionAttributeValues[':userId'] = userIdFilter;
    }

    // Apply filter expression
    if (filterExpressions.length > 0) {
      scanInput.FilterExpression = filterExpressions.join(' AND ');
      scanInput.ExpressionAttributeNames = expressionAttributeNames;
      if (Object.keys(expressionAttributeValues).length > 0) {
        scanInput.ExpressionAttributeValues = expressionAttributeValues;
      }
    }

    // Use pagination token if provided (Requirement 10.5)
    if (nextToken) {
      try {
        scanInput.ExclusiveStartKey = JSON.parse(
          Buffer.from(nextToken, 'base64').toString('utf-8')
        );
      } catch {
        return createBadRequestResponse('Invalid pagination token');
      }
    }

    // Execute Scan command
    const response = await client.send(new ScanCommand(scanInput));

    // Convert items to log entries
    const logs: LogEntry[] = [];
    if (response.Items) {
      for (const item of response.Items) {
        const logEntry = convertToLogEntry(item as Record<string, unknown>);
        if (logEntry) {
          // Apply date range filter (Requirement 4.3, 10.3)
          // Note: Date filtering is done client-side because DynamoDB Scan
          // doesn't support KeyConditionExpression
          if (isWithinDateRange(logEntry.timestamp, startDate, endDate)) {
            logs.push(logEntry);
          }
        }
      }
    }

    // Sort by timestamp descending (most recent first)
    logs.sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Apply pagination limit
    const paginatedLogs = logs.slice(0, limit);

    // Prepare response
    const result: ListLogsResponse = {
      logs: paginatedLogs,
      count: paginatedLogs.length,
    };

    // Include next token if there are more results
    if (response.LastEvaluatedKey) {
      result.nextToken = Buffer.from(
        JSON.stringify(response.LastEvaluatedKey)
      ).toString('base64');
    }

    return createSuccessResponse(result);
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
