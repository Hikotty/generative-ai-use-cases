/**
 * Error response utilities for admin Lambda functions.
 *
 * This module provides standardized error response generation
 * following the design specification.
 *
 * Requirements:
 * - 13.1: Log errors to CloudWatch Logs and return 500 error for unexpected Lambda errors
 * - 13.2: Return 504 error for DynamoDB query timeouts
 * - 13.3: Return appropriate HTTP status codes and error messages for Cognito API errors
 * - 13.4: Include row numbers and reasons in error response for CSV bulk registration errors
 * - 13.5: Display error messages as toast notifications on frontend
 * - 13.6: Include request ID, user ID, and timestamp in all error logs
 *
 * Design reference:
 * ```typescript
 * interface ErrorResponse {
 *   statusCode: number;
 *   body: string;  // JSON.stringify({ error: string, details?: any })
 * }
 * ```
 */

import { APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Standard error response body structure.
 */
export interface ErrorBody {
  /** Error message */
  error: string;
  /** Optional additional details */
  details?: unknown;
  /** Optional error code for client-side handling */
  code?: string;
}

/**
 * Error log context for CloudWatch logging.
 */
export interface ErrorLogContext {
  /** AWS request ID */
  requestId?: string;
  /** User ID who made the request */
  userId?: string;
  /** Timestamp of the error */
  timestamp: string;
  /** Error type/name */
  errorType?: string;
  /** Stack trace if available */
  stack?: string;
}

/**
 * Standard CORS headers for API responses.
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Creates a standardized error response.
 *
 * @param statusCode - HTTP status code
 * @param error - Error message
 * @param details - Optional additional details
 * @param code - Optional error code
 * @returns API Gateway proxy result
 */
export function createErrorResponse(
  statusCode: number,
  error: string,
  details?: unknown,
  code?: string
): APIGatewayProxyResult {
  const body: ErrorBody = { error };

  if (details !== undefined) {
    body.details = details;
  }

  if (code !== undefined) {
    body.code = code;
  }

  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Creates a 400 Bad Request response.
 *
 * Use for validation errors, malformed requests, etc.
 *
 * @param message - Error message
 * @param details - Optional validation error details
 * @returns API Gateway proxy result with 400 status
 */
export function createBadRequestResponse(
  message: string,
  details?: unknown
): APIGatewayProxyResult {
  return createErrorResponse(400, message, details, 'BAD_REQUEST');
}

/**
 * Creates a 401 Unauthorized response.
 *
 * Use when authentication is missing or invalid.
 *
 * @param message - Error message (default: 'Unauthorized')
 * @returns API Gateway proxy result with 401 status
 */
export function createUnauthorizedResponse(
  message: string = 'Unauthorized'
): APIGatewayProxyResult {
  return createErrorResponse(401, message, undefined, 'UNAUTHORIZED');
}

/**
 * Creates a 403 Forbidden response.
 *
 * Use when user is authenticated but lacks required permissions.
 * Requirement 2.5: Return 403 error when custom:role is not set or is not 'admin'
 *
 * @param message - Error message (default: 'Forbidden: Admin role required')
 * @returns API Gateway proxy result with 403 status
 */
export function createForbiddenResponse(
  message: string = 'Forbidden: Admin role required'
): APIGatewayProxyResult {
  return createErrorResponse(403, message, undefined, 'FORBIDDEN');
}

/**
 * Creates a 404 Not Found response.
 *
 * Use when requested resource does not exist.
 *
 * @param message - Error message (default: 'Resource not found')
 * @returns API Gateway proxy result with 404 status
 */
export function createNotFoundResponse(
  message: string = 'Resource not found'
): APIGatewayProxyResult {
  return createErrorResponse(404, message, undefined, 'NOT_FOUND');
}

/**
 * Creates a 500 Internal Server Error response.
 *
 * Use for unexpected errors. Requirement 13.1.
 *
 * @param message - Error message (default: 'Internal server error')
 * @param details - Optional error details (be careful not to expose sensitive info)
 * @returns API Gateway proxy result with 500 status
 */
export function createInternalErrorResponse(
  message: string = 'Internal server error',
  details?: unknown
): APIGatewayProxyResult {
  return createErrorResponse(500, message, details, 'INTERNAL_ERROR');
}

/**
 * Creates a 504 Gateway Timeout response.
 *
 * Use for DynamoDB timeouts. Requirement 13.2.
 *
 * @param message - Error message (default: 'Database connection timed out')
 * @returns API Gateway proxy result with 504 status
 */
export function createTimeoutResponse(
  message: string = 'Database connection timed out'
): APIGatewayProxyResult {
  return createErrorResponse(504, message, undefined, 'TIMEOUT');
}

/**
 * Creates a success response with JSON body.
 *
 * @param data - Response data
 * @param statusCode - HTTP status code (default: 200)
 * @returns API Gateway proxy result
 */
export function createSuccessResponse(
  data: unknown,
  statusCode: number = 200
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

/**
 * Logs an error with standardized context.
 *
 * Requirement 13.6: Include request ID, user ID, and timestamp in all error logs
 *
 * @param error - The error object
 * @param context - Lambda context for request ID
 * @param userId - User ID who made the request
 * @param additionalInfo - Any additional information to log
 */
export function logError(
  error: unknown,
  context?: Context,
  userId?: string,
  additionalInfo?: Record<string, unknown>
): void {
  const errorLogContext: ErrorLogContext = {
    requestId: context?.awsRequestId,
    userId,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof Error) {
    errorLogContext.errorType = error.name;
    errorLogContext.stack = error.stack;
  }

  console.error('Error occurred:', {
    ...errorLogContext,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message }
        : error,
    ...additionalInfo,
  });
}

/**
 * Handles an error and returns appropriate response.
 *
 * This function logs the error and returns a standardized error response
 * based on the error type.
 *
 * @param error - The error object
 * @param context - Lambda context for request ID
 * @param userId - User ID who made the request
 * @returns API Gateway proxy result with appropriate status code
 */
export function handleError(
  error: unknown,
  context?: Context,
  userId?: string
): APIGatewayProxyResult {
  logError(error, context, userId);

  // Check for specific error types
  if (error instanceof Error) {
    const errorName = error.name;
    const errorMessage = error.message;

    // DynamoDB timeout errors
    if (
      errorName === 'TimeoutError' ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('Timeout')
    ) {
      return createTimeoutResponse();
    }

    // Cognito specific errors (Requirement 13.3)
    if (errorName === 'UserNotFoundException') {
      return createNotFoundResponse('User not found');
    }

    if (errorName === 'UsernameExistsException') {
      return createBadRequestResponse('User already exists');
    }

    if (errorName === 'InvalidParameterException') {
      return createBadRequestResponse('Invalid parameter', errorMessage);
    }

    if (errorName === 'NotAuthorizedException') {
      return createForbiddenResponse('Not authorized to perform this action');
    }

    // Validation errors
    if (errorName === 'ValidationError') {
      return createBadRequestResponse(errorMessage);
    }
  }

  // Default to internal server error
  return createInternalErrorResponse();
}

/**
 * CSV bulk registration error details.
 *
 * Requirement 13.4: Include row numbers and error reasons in response
 * for CSV bulk registration with invalid data
 */
export interface CsvRowError {
  /** Row number (1-indexed) */
  row: number;
  /** Error reason */
  reason: string;
  /** Original data that caused the error */
  data?: string;
}

/**
 * Creates a response for CSV bulk registration with partial errors.
 *
 * @param successCount - Number of successfully processed rows
 * @param errors - Array of row errors
 * @returns API Gateway proxy result
 */
export function createCsvBulkResponse(
  successCount: number,
  errors: CsvRowError[]
): APIGatewayProxyResult {
  const hasErrors = errors.length > 0;

  return {
    statusCode: hasErrors ? 207 : 200, // 207 Multi-Status for partial success
    headers: CORS_HEADERS,
    body: JSON.stringify({
      success: successCount,
      failed: errors.length,
      errors: hasErrors ? errors : undefined,
    }),
  };
}
