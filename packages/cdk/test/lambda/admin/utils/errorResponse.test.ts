/**
 * Unit tests for errorResponse utility functions.
 *
 * Tests the standardized error response generation for admin Lambda functions.
 *
 * Requirements:
 * - 13.1: Log errors to CloudWatch Logs and return 500 error for unexpected Lambda errors
 * - 13.2: Return 504 error for DynamoDB query timeouts
 * - 13.3: Return appropriate HTTP status codes and error messages for Cognito API errors
 * - 13.4: Include row numbers and reasons in error response for CSV bulk registration errors
 * - 13.5: Display error messages as toast notifications on frontend
 * - 13.6: Include request ID, user ID, and timestamp in all error logs
 */

import { Context } from 'aws-lambda';
import {
  createErrorResponse,
  createBadRequestResponse,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createNotFoundResponse,
  createInternalErrorResponse,
  createTimeoutResponse,
  createSuccessResponse,
  createCsvBulkResponse,
  logError,
  handleError,
  CsvRowError,
} from '../../../../lambda/admin/utils/errorResponse';

/**
 * Helper function to create a mock Lambda Context.
 */
function createMockContext(requestId: string = 'test-request-id'): Context {
  return {
    awsRequestId: requestId,
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
    memoryLimitInMB: '128',
    logGroupName: '/aws/lambda/test',
    logStreamName: '2025/01/01/[$LATEST]test',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

describe('errorResponse utility', () => {
  describe('createErrorResponse', () => {
    it('should create error response with status code and message', () => {
      const result = createErrorResponse(400, 'Bad request');

      expect(result.statusCode).toBe(400);
      expect(result.headers).toHaveProperty('Content-Type', 'application/json');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');

      const body = JSON.parse(result.body);
      expect(body.error).toBe('Bad request');
    });

    it('should include details when provided', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const result = createErrorResponse(400, 'Validation error', details);

      const body = JSON.parse(result.body);
      expect(body.error).toBe('Validation error');
      expect(body.details).toEqual(details);
    });

    it('should include error code when provided', () => {
      const result = createErrorResponse(
        400,
        'Bad request',
        undefined,
        'BAD_REQUEST'
      );

      const body = JSON.parse(result.body);
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('should include CORS headers', () => {
      const result = createErrorResponse(500, 'Error');

      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Headers');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Methods');
    });
  });

  describe('createBadRequestResponse', () => {
    it('should return 400 status code', () => {
      const result = createBadRequestResponse('Invalid input');

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid input');
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('should include validation details', () => {
      const details = { fields: ['email', 'name'] };
      const result = createBadRequestResponse('Validation failed', details);

      const body = JSON.parse(result.body);
      expect(body.details).toEqual(details);
    });
  });

  describe('createUnauthorizedResponse', () => {
    it('should return 401 status code with default message', () => {
      const result = createUnauthorizedResponse();

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 status code with custom message', () => {
      const result = createUnauthorizedResponse('Token expired');

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Token expired');
    });
  });

  describe('createForbiddenResponse', () => {
    /**
     * Validates: Requirements 2.5
     * Return 403 error when custom:role is not set or is not 'admin'
     */
    it('should return 403 status code with default message', () => {
      const result = createForbiddenResponse();

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Forbidden: Admin role required');
      expect(body.code).toBe('FORBIDDEN');
    });

    it('should return 403 status code with custom message', () => {
      const result = createForbiddenResponse('Access denied');

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Access denied');
    });
  });

  describe('createNotFoundResponse', () => {
    it('should return 404 status code with default message', () => {
      const result = createNotFoundResponse();

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Resource not found');
      expect(body.code).toBe('NOT_FOUND');
    });

    it('should return 404 status code with custom message', () => {
      const result = createNotFoundResponse('User not found');

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('User not found');
    });
  });

  describe('createInternalErrorResponse', () => {
    /**
     * Validates: Requirements 13.1
     * Return 500 error for unexpected Lambda errors
     */
    it('should return 500 status code with default message', () => {
      const result = createInternalErrorResponse();

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal server error');
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should return 500 status code with custom message and details', () => {
      const result = createInternalErrorResponse('Database error', {
        table: 'users',
      });

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Database error');
      expect(body.details).toEqual({ table: 'users' });
    });
  });

  describe('createTimeoutResponse', () => {
    /**
     * Validates: Requirements 13.2
     * Return 504 error for DynamoDB query timeouts
     */
    it('should return 504 status code with default message', () => {
      const result = createTimeoutResponse();

      expect(result.statusCode).toBe(504);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Database connection timed out');
      expect(body.code).toBe('TIMEOUT');
    });

    it('should return 504 status code with custom message', () => {
      const result = createTimeoutResponse('Query timed out');

      expect(result.statusCode).toBe(504);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Query timed out');
    });
  });

  describe('createSuccessResponse', () => {
    it('should return 200 status code by default', () => {
      const data = { users: [{ id: '1', name: 'Test' }] };
      const result = createSuccessResponse(data);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual(data);
    });

    it('should return custom status code', () => {
      const data = { id: '123' };
      const result = createSuccessResponse(data, 201);

      expect(result.statusCode).toBe(201);
    });

    it('should include CORS headers', () => {
      const result = createSuccessResponse({});

      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    });
  });

  describe('createCsvBulkResponse', () => {
    /**
     * Validates: Requirements 13.4
     * Include row numbers and reasons in error response for CSV bulk registration errors
     */
    it('should return 200 when all rows succeed', () => {
      const result = createCsvBulkResponse(5, []);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(5);
      expect(body.failed).toBe(0);
      expect(body.errors).toBeUndefined();
    });

    it('should return 207 Multi-Status when some rows fail', () => {
      const errors: CsvRowError[] = [
        { row: 2, reason: 'Invalid email format', data: 'invalid-email' },
        { row: 5, reason: 'User already exists', data: 'existing@example.com' },
      ];
      const result = createCsvBulkResponse(3, errors);

      expect(result.statusCode).toBe(207);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(3);
      expect(body.failed).toBe(2);
      expect(body.errors).toHaveLength(2);
      expect(body.errors[0].row).toBe(2);
      expect(body.errors[0].reason).toBe('Invalid email format');
      expect(body.errors[1].row).toBe(5);
    });

    it('should return 207 when all rows fail', () => {
      const errors: CsvRowError[] = [
        { row: 1, reason: 'Invalid email' },
        { row: 2, reason: 'Invalid email' },
      ];
      const result = createCsvBulkResponse(0, errors);

      expect(result.statusCode).toBe(207);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(0);
      expect(body.failed).toBe(2);
    });
  });

  describe('logError', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    /**
     * Validates: Requirements 13.6
     * Include request ID, user ID, and timestamp in all error logs
     */
    it('should log error with request ID, user ID, and timestamp', () => {
      const error = new Error('Test error');
      const context = createMockContext('req-123');
      const userId = 'user-456';

      logError(error, context, userId);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedData = consoleErrorSpy.mock.calls[0][1];
      expect(loggedData.requestId).toBe('req-123');
      expect(loggedData.userId).toBe('user-456');
      expect(loggedData.timestamp).toBeDefined();
      expect(loggedData.errorType).toBe('Error');
    });

    it('should log error without context', () => {
      const error = new Error('Test error');

      logError(error, undefined, 'user-123');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedData = consoleErrorSpy.mock.calls[0][1];
      expect(loggedData.requestId).toBeUndefined();
      expect(loggedData.userId).toBe('user-123');
    });

    it('should log non-Error objects', () => {
      const error = { code: 'CUSTOM_ERROR', message: 'Something went wrong' };

      logError(error, createMockContext(), 'user-123');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedData = consoleErrorSpy.mock.calls[0][1];
      expect(loggedData.error).toEqual(error);
    });

    it('should include additional info when provided', () => {
      const error = new Error('Test error');
      const additionalInfo = {
        operation: 'createUser',
        targetEmail: 'test@example.com',
      };

      logError(error, createMockContext(), 'user-123', additionalInfo);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedData = consoleErrorSpy.mock.calls[0][1];
      expect(loggedData.operation).toBe('createUser');
      expect(loggedData.targetEmail).toBe('test@example.com');
    });

    it('should include stack trace for Error objects', () => {
      const error = new Error('Test error');

      logError(error, createMockContext(), 'user-123');

      const loggedData = consoleErrorSpy.mock.calls[0][1];
      expect(loggedData.stack).toBeDefined();
      expect(loggedData.stack).toContain('Error: Test error');
    });
  });

  describe('handleError', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    /**
     * Validates: Requirements 13.2
     * Return 504 error for DynamoDB query timeouts
     */
    it('should return 504 for timeout errors', () => {
      const error = new Error('Connection timeout');
      error.name = 'TimeoutError';

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(504);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Database connection timed out');
    });

    it('should return 504 for errors with timeout in message', () => {
      const error = new Error('Connection timeout after 30000ms');

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(504);
    });

    it('should return 504 for errors with Timeout in message (case-sensitive)', () => {
      const error = new Error('Request Timeout occurred');

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(504);
    });

    /**
     * Validates: Requirements 13.3
     * Return appropriate HTTP status codes and error messages for Cognito API errors
     */
    it('should return 404 for UserNotFoundException', () => {
      const error = new Error('User does not exist');
      error.name = 'UserNotFoundException';

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('User not found');
    });

    it('should return 400 for UsernameExistsException', () => {
      const error = new Error('User already exists');
      error.name = 'UsernameExistsException';

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('User already exists');
    });

    it('should return 400 for InvalidParameterException', () => {
      const error = new Error('Invalid email format');
      error.name = 'InvalidParameterException';

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid parameter');
    });

    it('should return 403 for NotAuthorizedException', () => {
      const error = new Error('Not authorized');
      error.name = 'NotAuthorizedException';

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Not authorized to perform this action');
    });

    it('should return 400 for ValidationError', () => {
      const error = new Error('Email is required');
      error.name = 'ValidationError';

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Email is required');
    });

    /**
     * Validates: Requirements 13.1
     * Return 500 error for unexpected Lambda errors
     */
    it('should return 500 for unknown errors', () => {
      const error = new Error('Unknown error');

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 for non-Error objects', () => {
      const error = { code: 'UNKNOWN', message: 'Something went wrong' };

      const result = handleError(error, createMockContext(), 'user-123');

      expect(result.statusCode).toBe(500);
    });

    it('should log error before returning response', () => {
      const error = new Error('Test error');

      handleError(error, createMockContext('req-abc'), 'user-xyz');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
