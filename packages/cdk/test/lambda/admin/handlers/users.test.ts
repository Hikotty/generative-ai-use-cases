/**
 * Unit tests for user management Lambda handlers.
 *
 * Tests the user management functionality for admin dashboard.
 *
 * Requirements:
 * - 3.1: Display all Cognito users in a list
 * - 3.2: Display email, admin role, status, and creation date for each user
 * - 3.3: Filter users by partial email match
 * - 3.4: Pagination with 50 users per page
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  UserStatusType,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';
import {
  listUsersHandler,
  filterUsersByEmail,
  UserResponse,
  resetCognitoClient,
} from '../../../../lambda/admin/handlers/users';

// Mock Cognito client
const cognitoMock = mockClient(CognitoIdentityProviderClient);

/**
 * Helper function to create a mock APIGatewayProxyEvent with authorizer claims.
 */
function createMockEvent(
  claims?: Record<string, string>,
  queryParams?: Record<string, string>
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/admin/users',
    pathParameters: null,
    queryStringParameters: queryParams || null,
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

/**
 * Helper function to create a mock Lambda context.
 */
function createMockContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test',
    logStreamName: '2025/01/01/[$LATEST]test',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

/**
 * Helper function to create mock Cognito users.
 */
function createMockCognitoUsers(
  count: number,
  options?: {
    prefix?: string;
    isAdmin?: boolean;
    enabled?: boolean;
  }
) {
  const prefix = options?.prefix || 'user';
  const isAdmin = options?.isAdmin ?? false;
  const enabled = options?.enabled ?? true;

  return Array.from({ length: count }, (_, i) => {
    // Create valid dates by using different months/days
    const month = Math.floor(i / 28) + 1;
    const day = (i % 28) + 1;
    const dateStr = `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return {
      Username: `${prefix}-${i + 1}`,
      Attributes: [
        { Name: 'email', Value: `${prefix}${i + 1}@example.com` },
        { Name: 'email_verified', Value: 'true' },
        ...(isAdmin ? [{ Name: 'custom:role', Value: 'admin' }] : []),
      ],
      Enabled: enabled,
      UserCreateDate: new Date(dateStr),
      UserLastModifiedDate: new Date(dateStr),
      UserStatus: 'CONFIRMED' as UserStatusType,
    };
  });
}

describe('User Management Lambda Handlers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    cognitoMock.reset();
    resetCognitoClient();
    process.env = {
      ...originalEnv,
      USER_POOL_ID: 'test-user-pool-id',
      TABLE_NAME: 'test-table',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('filterUsersByEmail', () => {
    const testUsers: UserResponse[] = [
      {
        userId: 'user-1',
        email: 'admin@example.com',
        isAdmin: true,
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
        emailVerified: true,
      },
      {
        userId: 'user-2',
        email: 'user@example.com',
        isAdmin: false,
        status: 'active',
        createdAt: '2025-01-02T00:00:00.000Z',
        emailVerified: true,
      },
      {
        userId: 'user-3',
        email: 'test@company.org',
        isAdmin: false,
        status: 'disabled',
        createdAt: '2025-01-03T00:00:00.000Z',
        emailVerified: false,
      },
    ];

    /**
     * Validates: Requirements 3.3
     * Filter users by partial email match
     */
    it('should filter users by partial email match (case-insensitive)', () => {
      const result = filterUsersByEmail(testUsers, 'example');

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('admin@example.com');
      expect(result[1].email).toBe('user@example.com');
    });

    it('should return all users when search keyword is empty', () => {
      const result = filterUsersByEmail(testUsers, '');

      expect(result).toHaveLength(3);
    });

    it('should return all users when search keyword is whitespace only', () => {
      const result = filterUsersByEmail(testUsers, '   ');

      expect(result).toHaveLength(3);
    });

    it('should be case-insensitive', () => {
      const result = filterUsersByEmail(testUsers, 'ADMIN');

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('admin@example.com');
    });

    it('should return empty array when no matches found', () => {
      const result = filterUsersByEmail(testUsers, 'nonexistent');

      expect(result).toHaveLength(0);
    });

    it('should match partial strings anywhere in email', () => {
      const result = filterUsersByEmail(testUsers, 'company');

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('test@company.org');
    });
  });

  describe('listUsersHandler', () => {
    /**
     * Validates: Requirements 2.4, 2.5
     * Return 403 when user is not admin
     */
    it('should return 403 when user is not admin', async () => {
      const event = createMockEvent({
        'cognito:username': 'regular-user',
        email: 'user@example.com',
        // No custom:role attribute
      });
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Forbidden');
    });

    /**
     * Validates: Requirements 3.1, 3.2
     * Display all Cognito users with email, admin role, status, and creation date
     */
    it('should return list of users with correct attributes', async () => {
      const mockUsers = createMockCognitoUsers(3);
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
      });

      const event = createMockEvent({
        'cognito:username': 'admin-user',
        email: 'admin@example.com',
        'custom:role': 'admin',
      });
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.users).toHaveLength(3);

      // Verify user attributes (Requirement 3.2)
      const firstUser = body.users[0];
      expect(firstUser).toHaveProperty('userId');
      expect(firstUser).toHaveProperty('email');
      expect(firstUser).toHaveProperty('isAdmin');
      expect(firstUser).toHaveProperty('status');
      expect(firstUser).toHaveProperty('createdAt');
      expect(firstUser).toHaveProperty('emailVerified');
    });

    /**
     * Validates: Requirements 3.4
     * Pagination with 50 users per page
     */
    it('should limit results to 50 users per page', async () => {
      const mockUsers = createMockCognitoUsers(60);
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
        PaginationToken: 'next-page-token',
      });

      const event = createMockEvent({
        'cognito:username': 'admin-user',
        email: 'admin@example.com',
        'custom:role': 'admin',
      });
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.users.length).toBeLessThanOrEqual(50);
    });

    it('should include nextToken when more results exist', async () => {
      const mockUsers = createMockCognitoUsers(60);
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
        PaginationToken: 'next-page-token',
      });

      const event = createMockEvent({
        'cognito:username': 'admin-user',
        email: 'admin@example.com',
        'custom:role': 'admin',
      });
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.nextToken).toBe('next-page-token');
    });

    it('should use pagination token from query parameters', async () => {
      const mockUsers = createMockCognitoUsers(10);
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
      });

      const event = createMockEvent(
        {
          'cognito:username': 'admin-user',
          email: 'admin@example.com',
          'custom:role': 'admin',
        },
        { nextToken: 'previous-page-token' }
      );
      const context = createMockContext();

      await listUsersHandler(event, context);

      const calls = cognitoMock.commandCalls(ListUsersCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.PaginationToken).toBe(
        'previous-page-token'
      );
    });

    /**
     * Validates: Requirements 3.3
     * Filter users by partial email match
     */
    it('should filter users by search keyword', async () => {
      const mockUsers = [
        ...createMockCognitoUsers(2, { prefix: 'admin' }),
        ...createMockCognitoUsers(3, { prefix: 'user' }),
      ];
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
      });

      const event = createMockEvent(
        {
          'cognito:username': 'admin-user',
          email: 'admin@example.com',
          'custom:role': 'admin',
        },
        { search: 'admin' }
      );
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Should only return users with 'admin' in email
      expect(
        body.users.every((u: UserResponse) => u.email.includes('admin'))
      ).toBe(true);
    });

    it('should correctly identify admin users', async () => {
      const mockUsers = [
        {
          Username: 'admin-user',
          Attributes: [
            { Name: 'email', Value: 'admin@example.com' },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'custom:role', Value: 'admin' },
          ],
          Enabled: true,
          UserCreateDate: new Date('2025-01-01'),
          UserLastModifiedDate: new Date('2025-01-01'),
          UserStatus: 'CONFIRMED' as UserStatusType,
        },
        {
          Username: 'regular-user',
          Attributes: [
            { Name: 'email', Value: 'user@example.com' },
            { Name: 'email_verified', Value: 'true' },
          ],
          Enabled: true,
          UserCreateDate: new Date('2025-01-02'),
          UserLastModifiedDate: new Date('2025-01-02'),
          UserStatus: 'CONFIRMED' as UserStatusType,
        },
      ];
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
      });

      const event = createMockEvent({
        'cognito:username': 'admin-user',
        email: 'admin@example.com',
        'custom:role': 'admin',
      });
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      const adminUser = body.users.find(
        (u: UserResponse) => u.email === 'admin@example.com'
      );
      const regularUser = body.users.find(
        (u: UserResponse) => u.email === 'user@example.com'
      );

      expect(adminUser.isAdmin).toBe(true);
      expect(regularUser.isAdmin).toBe(false);
    });

    it('should correctly identify disabled users', async () => {
      const mockUsers = [
        {
          Username: 'active-user',
          Attributes: [{ Name: 'email', Value: 'active@example.com' }],
          Enabled: true,
          UserCreateDate: new Date('2025-01-01'),
          UserLastModifiedDate: new Date('2025-01-01'),
          UserStatus: 'CONFIRMED' as UserStatusType,
        },
        {
          Username: 'disabled-user',
          Attributes: [{ Name: 'email', Value: 'disabled@example.com' }],
          Enabled: false,
          UserCreateDate: new Date('2025-01-02'),
          UserLastModifiedDate: new Date('2025-01-02'),
          UserStatus: 'CONFIRMED' as UserStatusType,
        },
      ];
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
      });

      const event = createMockEvent({
        'cognito:username': 'admin-user',
        email: 'admin@example.com',
        'custom:role': 'admin',
      });
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      const activeUser = body.users.find(
        (u: UserResponse) => u.email === 'active@example.com'
      );
      const disabledUser = body.users.find(
        (u: UserResponse) => u.email === 'disabled@example.com'
      );

      expect(activeUser.status).toBe('active');
      expect(disabledUser.status).toBe('disabled');
    });

    it('should handle empty user list', async () => {
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [],
      });

      const event = createMockEvent({
        'cognito:username': 'admin-user',
        email: 'admin@example.com',
        'custom:role': 'admin',
      });
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.users).toHaveLength(0);
    });

    it('should handle Cognito API errors', async () => {
      cognitoMock.on(ListUsersCommand).rejects(new Error('Cognito error'));

      const event = createMockEvent({
        'cognito:username': 'admin-user',
        email: 'admin@example.com',
        'custom:role': 'admin',
      });
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(500);
    });

    it('should respect custom limit parameter', async () => {
      const mockUsers = createMockCognitoUsers(30);
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
      });

      const event = createMockEvent(
        {
          'cognito:username': 'admin-user',
          email: 'admin@example.com',
          'custom:role': 'admin',
        },
        { limit: '10' }
      );
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.users.length).toBeLessThanOrEqual(10);
    });

    it('should enforce maximum limit of 50', async () => {
      const mockUsers = createMockCognitoUsers(60);
      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
      });

      const event = createMockEvent(
        {
          'cognito:username': 'admin-user',
          email: 'admin@example.com',
          'custom:role': 'admin',
        },
        { limit: '100' } // Request more than max
      );
      const context = createMockContext();

      const result = await listUsersHandler(event, context);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.users.length).toBeLessThanOrEqual(50);
    });
  });
});
