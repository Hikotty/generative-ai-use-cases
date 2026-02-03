/**
 * Unit tests for roleCheck utility functions.
 *
 * Tests the admin role checking functionality used in Lambda functions.
 *
 * Requirements:
 * - 2.4: Allow access when user with custom:role='admin' accesses /admin/* endpoints
 * - 2.5: Return 403 error when user without admin role accesses /admin/* endpoints
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  checkAdminRole,
  extractClaims,
  getAdminUserId,
  getAdminEmail,
} from '../../../../lambda/admin/utils/roleCheck';

/**
 * Helper function to create a mock APIGatewayProxyEvent with authorizer claims.
 */
function createMockEvent(
  claims?: Record<string, string>
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/admin/users',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api-id',
      authorizer: claims ? { claims } : undefined,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
      path: '/admin/users',
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource-id',
      resourcePath: '/admin/users',
    },
  } as APIGatewayProxyEvent;
}

describe('roleCheck utility', () => {
  describe('extractClaims', () => {
    it('should return claims when authorizer context exists', () => {
      const claims = {
        'cognito:username': 'test-user',
        email: 'test@example.com',
        'custom:role': 'admin',
      };
      const event = createMockEvent(claims);

      const result = extractClaims(event);

      expect(result).toEqual(claims);
    });

    it('should return undefined when authorizer context is missing', () => {
      const event = createMockEvent();
      // Remove authorizer
      event.requestContext.authorizer = undefined;

      const result = extractClaims(event);

      expect(result).toBeUndefined();
    });

    it('should return undefined when requestContext is missing', () => {
      const event = createMockEvent();
      // @ts-expect-error - Testing edge case
      event.requestContext = undefined;

      const result = extractClaims(event);

      expect(result).toBeUndefined();
    });
  });

  describe('checkAdminRole', () => {
    /**
     * Validates: Requirements 2.4
     * When custom:role='admin', isAdmin should be true
     */
    it('should return isAdmin=true when custom:role is admin', () => {
      const claims = {
        'cognito:username': 'admin-user-123',
        email: 'admin@example.com',
        'custom:role': 'admin',
      };
      const event = createMockEvent(claims);

      const result = checkAdminRole(event);

      expect(result.isAdmin).toBe(true);
      expect(result.userId).toBe('admin-user-123');
      expect(result.email).toBe('admin@example.com');
      expect(result.role).toBe('admin');
    });

    /**
     * Validates: Requirements 2.5
     * When custom:role is not set, isAdmin should be false
     */
    it('should return isAdmin=false when custom:role is not set', () => {
      const claims = {
        'cognito:username': 'regular-user-456',
        email: 'user@example.com',
      };
      const event = createMockEvent(claims);

      const result = checkAdminRole(event);

      expect(result.isAdmin).toBe(false);
      expect(result.userId).toBe('regular-user-456');
      expect(result.email).toBe('user@example.com');
      expect(result.role).toBeUndefined();
    });

    /**
     * Validates: Requirements 2.5
     * When custom:role is set to a value other than 'admin', isAdmin should be false
     */
    it('should return isAdmin=false when custom:role is not admin', () => {
      const claims = {
        'cognito:username': 'user-789',
        email: 'user@example.com',
        'custom:role': 'user',
      };
      const event = createMockEvent(claims);

      const result = checkAdminRole(event);

      expect(result.isAdmin).toBe(false);
      expect(result.role).toBe('user');
    });

    /**
     * Validates: Requirements 2.5
     * When custom:role is empty string, isAdmin should be false
     */
    it('should return isAdmin=false when custom:role is empty string', () => {
      const claims = {
        'cognito:username': 'user-empty-role',
        email: 'user@example.com',
        'custom:role': '',
      };
      const event = createMockEvent(claims);

      const result = checkAdminRole(event);

      expect(result.isAdmin).toBe(false);
      expect(result.role).toBe('');
    });

    it('should return isAdmin=false when authorizer claims are missing', () => {
      const event = createMockEvent();
      event.requestContext.authorizer = undefined;

      const result = checkAdminRole(event);

      expect(result.isAdmin).toBe(false);
      expect(result.userId).toBeUndefined();
      expect(result.email).toBeUndefined();
      expect(result.role).toBeUndefined();
    });

    it('should handle case-sensitive role check (Admin vs admin)', () => {
      const claims = {
        'cognito:username': 'user-case-test',
        email: 'user@example.com',
        'custom:role': 'Admin', // Capital A
      };
      const event = createMockEvent(claims);

      const result = checkAdminRole(event);

      // Role check should be case-sensitive
      expect(result.isAdmin).toBe(false);
      expect(result.role).toBe('Admin');
    });

    it('should handle whitespace in role value', () => {
      const claims = {
        'cognito:username': 'user-whitespace',
        email: 'user@example.com',
        'custom:role': ' admin ', // With whitespace
      };
      const event = createMockEvent(claims);

      const result = checkAdminRole(event);

      // Role check should be exact match
      expect(result.isAdmin).toBe(false);
      expect(result.role).toBe(' admin ');
    });
  });

  describe('getAdminUserId', () => {
    it('should return user ID when claims exist', () => {
      const claims = {
        'cognito:username': 'test-user-id',
        email: 'test@example.com',
      };
      const event = createMockEvent(claims);

      const result = getAdminUserId(event);

      expect(result).toBe('test-user-id');
    });

    it('should return undefined when claims are missing', () => {
      const event = createMockEvent();
      event.requestContext.authorizer = undefined;

      const result = getAdminUserId(event);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cognito:username is not in claims', () => {
      const claims = {
        email: 'test@example.com',
      };
      const event = createMockEvent(claims);

      const result = getAdminUserId(event);

      expect(result).toBeUndefined();
    });
  });

  describe('getAdminEmail', () => {
    it('should return email when claims exist', () => {
      const claims = {
        'cognito:username': 'test-user-id',
        email: 'admin@example.com',
      };
      const event = createMockEvent(claims);

      const result = getAdminEmail(event);

      expect(result).toBe('admin@example.com');
    });

    it('should return undefined when claims are missing', () => {
      const event = createMockEvent();
      event.requestContext.authorizer = undefined;

      const result = getAdminEmail(event);

      expect(result).toBeUndefined();
    });

    it('should return undefined when email is not in claims', () => {
      const claims = {
        'cognito:username': 'test-user-id',
      };
      const event = createMockEvent(claims);

      const result = getAdminEmail(event);

      expect(result).toBeUndefined();
    });
  });
});
