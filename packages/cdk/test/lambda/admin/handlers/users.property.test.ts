/**
 * Property-based tests for CSV processing in user management.
 *
 * This file contains property-based tests using fast-check to verify
 * the correctness of CSV parsing and bulk user registration.
 *
 * Properties tested:
 * - Property 5: CSV bulk registration
 * - Property 6: CSV bulk registration error handling
 * - Property 16: CSV parsing
 *
 * Requirements:
 * - 3.12: Bulk user registration from CSV
 * - 3.13: Row-by-row error handling
 * - 16.8: UTF-8 BOM support
 * - 16.9: Skip empty lines
 * - 16.10: Skip comment lines
 */

/* eslint-disable i18nhelper/no-jp-comment */
/* eslint-disable i18nhelper/no-jp-string */

import * as fc from 'fast-check';
import {
  parseCSV,
  isValidEmail,
  bulkCreateUsersHandler,
  BulkRegistrationResponse,
  resetCognitoClient,
} from '../../../../lambda/admin/handlers/users';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock Cognito client
const cognitoMock = mockClient(CognitoIdentityProviderClient);

// Mock DynamoDB Document client
const dynamoMock = mockClient(DynamoDBDocumentClient);

/**
 * Helper function to create a mock APIGatewayProxyEvent with admin claims.
 */
function createMockEvent(body: string): APIGatewayProxyEvent {
  return {
    body,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/admin/users/bulk',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api-id',
      authorizer: {
        claims: {
          'cognito:username': 'admin-user',
          email: 'admin@example.com',
          'custom:role': 'admin',
        },
      },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
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
      path: '/admin/users/bulk',
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource-id',
      resourcePath: '/admin/users/bulk',
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
 * Arbitrary for generating valid email addresses.
 */
const validEmailArbitrary = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]+$/),
    fc.stringMatching(/^[a-z0-9]+$/),
    fc.constantFrom('com', 'org', 'net', 'edu')
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * Arbitrary for generating invalid email addresses.
 */
const invalidEmailArbitrary = fc.oneof(
  fc.constant(''),
  fc.constant('invalid'),
  fc.constant('no-at-sign.com'),
  fc.constant('@nodomain.com'),
  fc.constant('nolocal@'),
  fc.constant('spaces in@email.com'),
  fc.constant('double@@domain.com')
);

/**
 * Arbitrary for generating CSV content with valid emails.
 */
const validCSVArbitrary = fc
  .array(validEmailArbitrary, { minLength: 1, maxLength: 20 })
  .map((emails) => {
    const header = 'email,isAdmin\n';
    const rows = emails.map((email) => `${email},false`).join('\n');
    return header + rows;
  });

/**
 * Arbitrary for generating invalid email addresses (non-empty).
 * Empty strings are filtered out by parseCSV, so we use non-empty invalid emails.
 */
const nonEmptyInvalidEmailArbitrary = fc.oneof(
  fc.constant('invalid'),
  fc.constant('no-at-sign.com'),
  fc.constant('@nodomain.com'),
  fc.constant('nolocal@'),
  fc.constant('spaces in@email.com'),
  fc.constant('double@@domain.com')
);

/**
 * Arbitrary for generating CSV content with mixed valid/invalid emails.
 * Ensures at least one non-empty email is included so parseCSV returns results.
 */
const mixedCSVArbitrary = fc
  .tuple(
    // At least one valid or non-empty invalid email to ensure parseCSV returns results
    fc.oneof(
      validEmailArbitrary.map((email) => ({ email, valid: true })),
      nonEmptyInvalidEmailArbitrary.map((email) => ({ email, valid: false }))
    ),
    // Additional entries (can include empty strings)
    fc.array(
      fc.oneof(
        validEmailArbitrary.map((email) => ({ email, valid: true })),
        invalidEmailArbitrary.map((email) => ({ email, valid: false }))
      ),
      { minLength: 1, maxLength: 19 }
    )
  )
  .map(([firstEntry, restEntries]) => {
    const entries = [firstEntry, ...restEntries];
    const header = 'email,isAdmin\n';
    const rows = entries.map((entry) => `${entry.email},false`).join('\n');
    return { csv: header + rows, entries };
  });

/**
 * Arbitrary for generating CSV with UTF-8 BOM, empty lines, and comments.
 */
const csvWithSpecialCharsArbitrary = fc
  .array(validEmailArbitrary, { minLength: 1, maxLength: 10 })
  .chain((emails) =>
    fc
      .tuple(
        fc.boolean(), // Add BOM?
        fc.array(fc.nat(emails.length), { maxLength: 3 }), // Positions for empty lines
        fc.array(fc.nat(emails.length), { maxLength: 3 }) // Positions for comments
      )
      .map(([addBOM, emptyLinePositions, commentPositions]) => {
        let csv = addBOM ? '\uFEFF' : '';
        csv += 'email,isAdmin\n';

        const emptySet = new Set(emptyLinePositions);
        const commentSet = new Set(commentPositions);

        for (let i = 0; i < emails.length; i++) {
          if (emptySet.has(i)) {
            csv += '\n';
          }
          if (commentSet.has(i)) {
            csv += '# This is a comment\n';
          }
          csv += `${emails[i]},false\n`;
        }

        return { csv, emails, addBOM };
      })
  );

describe('CSV Processing Property Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    cognitoMock.reset();
    dynamoMock.reset();
    resetCognitoClient();
    process.env = {
      ...originalEnv,
      USER_POOL_ID: 'test-user-pool-id',
      TABLE_NAME: 'test-table',
    };

    // Mock DynamoDB PutCommand to succeed
    dynamoMock.on(PutCommand).resolves({});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Property 16: CSVパース', () => {
    /**
     * **Validates: Requirements 16.8, 16.9, 16.10**
     *
     * Property 16: 任意のCSVファイル（UTF-8 BOM付き、空行、コメント行を含む）に対して、
     * BOMが正しく処理され、空行と#で始まる行がスキップされる
     *
     * For any CSV file (with UTF-8 BOM, empty lines, comment lines),
     * the BOM should be correctly processed, and empty lines and lines
     * starting with # should be skipped.
     */
    it('should correctly parse CSV with BOM, empty lines, and comments', () => {
      fc.assert(
        fc.property(csvWithSpecialCharsArbitrary, ({ csv, emails }) => {
          const parsed = parseCSV(csv);

          // All valid emails should be extracted
          expect(parsed).toHaveLength(emails.length);

          // All parsed emails should match the original emails
          for (let i = 0; i < emails.length; i++) {
            expect(parsed[i]).toBe(emails[i]);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 16.8**
     *
     * UTF-8 BOM should be correctly removed from CSV content.
     */
    it('should handle UTF-8 BOM correctly', () => {
      fc.assert(
        fc.property(validCSVArbitrary, (csvWithoutBOM) => {
          const csvWithBOM = '\uFEFF' + csvWithoutBOM;

          const parsedWithBOM = parseCSV(csvWithBOM);
          const parsedWithoutBOM = parseCSV(csvWithoutBOM);

          // Both should produce the same result
          expect(parsedWithBOM).toEqual(parsedWithoutBOM);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 16.9**
     *
     * Empty lines should be skipped during CSV parsing.
     */
    it('should skip empty lines', () => {
      fc.assert(
        fc.property(
          fc.array(validEmailArbitrary, { minLength: 1, maxLength: 10 }),
          (emails) => {
            // Create CSV with empty lines between data rows
            const header = 'email,isAdmin\n';
            const rows = emails
              .map((email) => `\n\n${email},false\n\n`)
              .join('');
            const csv = header + rows;

            const parsed = parseCSV(csv);

            // Should extract all emails despite empty lines
            expect(parsed).toHaveLength(emails.length);
            expect(parsed).toEqual(emails);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 16.10**
     *
     * Comment lines (starting with #) should be skipped during CSV parsing.
     */
    it('should skip comment lines', () => {
      fc.assert(
        fc.property(
          fc.array(validEmailArbitrary, { minLength: 1, maxLength: 10 }),
          (emails) => {
            // Create CSV with comment lines
            const header = 'email,isAdmin\n';
            const rows = emails
              .map((email) => `# Comment line\n${email},false`)
              .join('\n');
            const csv = header + rows;

            const parsed = parseCSV(csv);

            // Should extract all emails despite comment lines
            expect(parsed).toHaveLength(emails.length);
            expect(parsed).toEqual(emails);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 16.10**
     *
     * Email validation should correctly identify valid and invalid emails.
     */
    it('should validate email addresses correctly', () => {
      fc.assert(
        fc.property(validEmailArbitrary, (email) => {
          expect(isValidEmail(email)).toBe(true);
        }),
        { numRuns: 100 }
      );

      fc.assert(
        fc.property(invalidEmailArbitrary, (email) => {
          expect(isValidEmail(email)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: CSV一括登録処理', () => {
    /**
     * **Validates: Requirements 3.12**
     *
     * Property 5: 任意の有効なCSVファイルに対して、すべての行のユーザーが正常に作成されるべき
     *
     * For any valid CSV file (with correct headers and valid email addresses),
     * all users should be successfully created.
     */
    it('should successfully create all users from valid CSV', async () => {
      await fc.assert(
        fc.asyncProperty(validCSVArbitrary, async (csv) => {
          // Mock successful user creation
          cognitoMock.on(AdminCreateUserCommand).resolves({
            User: {
              Username: 'test-user',
              Enabled: true,
            },
          });

          const requestBody = JSON.stringify({ csv, isAdmin: false });
          const event = createMockEvent(requestBody);
          const context = createMockContext();

          const result = await bulkCreateUsersHandler(event, context);

          expect(result.statusCode).toBe(200);

          const response: BulkRegistrationResponse = JSON.parse(result.body);

          // All users should be successfully created
          expect(response.successCount).toBe(response.totalRows);
          expect(response.failureCount).toBe(0);

          // All results should be successful
          expect(response.results.every((r) => r.success)).toBe(true);
        }),
        { numRuns: 50 } // Reduced runs for async tests
      );
    });
  });

  describe('Property 6: CSV一括登録エラーハンドリング', () => {
    /**
     * **Validates: Requirements 3.13**
     *
     * Property 6: 任意のCSVファイル（有効な行と無効な行の混在）に対して、
     * 有効な行のユーザーは作成され、無効な行はエラーとして報告される
     *
     * For any CSV file (with mixed valid and invalid rows),
     * valid rows should create users, and invalid rows should be reported as errors.
     */
    it('should handle mixed valid/invalid rows correctly', async () => {
      await fc.assert(
        fc.asyncProperty(mixedCSVArbitrary, async ({ csv }) => {
          // Mock Cognito responses
          cognitoMock.on(AdminCreateUserCommand).callsFake((input) => {
            const email = input.Username;
            // Check if email is valid
            if (isValidEmail(email || '')) {
              return Promise.resolve({
                User: {
                  Username: email,
                  Enabled: true,
                },
              });
            } else {
              return Promise.reject(new Error('Invalid email'));
            }
          });

          const requestBody = JSON.stringify({ csv, isAdmin: false });
          const event = createMockEvent(requestBody);
          const context = createMockContext();

          const result = await bulkCreateUsersHandler(event, context);

          expect(result.statusCode).toBe(200);

          const response: BulkRegistrationResponse = JSON.parse(result.body);

          // Parse the CSV to see what emails were actually extracted
          const parsedEmails = parseCSV(csv);

          // Count expected valid and invalid entries based on parsed emails
          // (empty emails are filtered out during parsing)
          const validEmails = parsedEmails.filter((email) =>
            isValidEmail(email)
          );
          const invalidEmails = parsedEmails.filter(
            (email) => !isValidEmail(email)
          );

          // Success count should match valid emails
          expect(response.successCount).toBe(validEmails.length);

          // Failure count should match invalid emails
          expect(response.failureCount).toBe(invalidEmails.length);

          // Total rows should match parsed emails (not original entries)
          expect(response.totalRows).toBe(parsedEmails.length);

          // Verify that error messages are included for failed rows
          const failedResults = response.results.filter((r) => !r.success);
          expect(failedResults.every((r) => r.error !== undefined)).toBe(true);

          // Verify that row numbers are included
          expect(response.results.every((r) => r.row > 0)).toBe(true);
        }),
        { numRuns: 50 } // Reduced runs for async tests
      );
    });

    /**
     * **Validates: Requirements 3.13**
     *
     * When a user already exists, it should be reported as an error
     * but other users should still be created.
     */
    it('should handle existing users gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validEmailArbitrary, { minLength: 3, maxLength: 10 }),
          fc.nat(),
          async (emails, existingUserIndex) => {
            const index = existingUserIndex % emails.length;

            // Mock Cognito responses
            cognitoMock.on(AdminCreateUserCommand).callsFake((input) => {
              const email = input.Username;
              // Simulate one user already exists
              if (email === emails[index]) {
                return Promise.reject(
                  new UsernameExistsException({
                    message: 'User already exists',
                    $metadata: {},
                  })
                );
              }
              return Promise.resolve({
                User: {
                  Username: email,
                  Enabled: true,
                },
              });
            });

            const header = 'email,isAdmin\n';
            const rows = emails.map((email) => `${email},false`).join('\n');
            const csv = header + rows;

            const requestBody = JSON.stringify({ csv, isAdmin: false });
            const event = createMockEvent(requestBody);
            const context = createMockContext();

            const result = await bulkCreateUsersHandler(event, context);

            expect(result.statusCode).toBe(200);

            const response: BulkRegistrationResponse = JSON.parse(result.body);

            // One user should fail (already exists)
            expect(response.failureCount).toBe(1);

            // All other users should succeed
            expect(response.successCount).toBe(emails.length - 1);

            // The failed result should have an error message
            const failedResult = response.results.find((r) => !r.success);
            expect(failedResult).toBeDefined();
            expect(failedResult?.error).toContain('already exists');
          }
        ),
        { numRuns: 30 } // Reduced runs for async tests
      );
    });
  });
});
