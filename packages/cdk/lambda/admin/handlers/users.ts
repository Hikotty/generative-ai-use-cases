/**
 * User management Lambda handler for admin dashboard.
 *
 * This module provides handlers for user management operations:
 * - GET /admin/users: List all users with pagination and search filtering
 * - POST /admin/users: Create a new user
 * - PUT /admin/users/{userId}: Update user (grant/revoke admin, enable/disable)
 * - DELETE /admin/users/{userId}: Delete a user
 * - POST /admin/users/bulk: Bulk create users from CSV
 *
 * Requirements:
 * - 3.1: Display all Cognito users in a list
 * - 3.2: Display email, admin role, status, and creation date for each user
 * - 3.3: Filter users by partial email match
 * - 3.4: Pagination with 50 users per page
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersCommandInput,
  UserType,
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminDeleteUserCommand,
  UsernameExistsException,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { checkAdminRole, getAdminUserId } from '../utils/roleCheck';
import {
  createForbiddenResponse,
  createSuccessResponse,
  handleError,
  logError,
  createBadRequestResponse,
} from '../utils/errorResponse';
import { recordAuditLog, AuditAction } from '../utils/auditLog';

// Cognito client singleton
let cognitoClient: CognitoIdentityProviderClient | null = null;

/**
 * Gets or creates the Cognito client.
 */
function getCognitoClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) {
    cognitoClient = new CognitoIdentityProviderClient({});
  }
  return cognitoClient;
}

/**
 * Gets the User Pool ID from environment variable.
 */
function getUserPoolId(): string {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    throw new Error('USER_POOL_ID environment variable is not set');
  }
  return userPoolId;
}

/**
 * User response structure for API.
 */
export interface UserResponse {
  /** User ID (Cognito username) */
  userId: string;
  /** User email address */
  email: string;
  /** Whether user has admin role */
  isAdmin: boolean;
  /** User status (active/disabled) */
  status: 'active' | 'disabled';
  /** User creation date in ISO 8601 format */
  createdAt: string;
  /** Email verification status */
  emailVerified: boolean;
}

/**
 * List users response structure.
 */
export interface ListUsersResponse {
  /** Array of users */
  users: UserResponse[];
  /** Pagination token for next page (if more results exist) */
  nextToken?: string;
  /** Total count of users (if available) */
  totalCount?: number;
}

/**
 * Extracts user attribute value from Cognito user attributes.
 *
 * @param user - Cognito user object
 * @param attributeName - Name of the attribute to extract
 * @returns Attribute value or undefined
 */
function getUserAttribute(
  user: UserType,
  attributeName: string
): string | undefined {
  return user.Attributes?.find((attr) => attr.Name === attributeName)?.Value;
}

/**
 * Converts Cognito UserType to UserResponse.
 *
 * @param user - Cognito user object
 * @returns UserResponse object
 */
function convertToUserResponse(user: UserType): UserResponse {
  const email = getUserAttribute(user, 'email') || '';
  const role = getUserAttribute(user, 'custom:role');
  const emailVerified = getUserAttribute(user, 'email_verified') === 'true';

  return {
    userId: user.Username || '',
    email,
    isAdmin: role === 'admin',
    status: user.Enabled ? 'active' : 'disabled',
    createdAt: user.UserCreateDate?.toISOString() || new Date().toISOString(),
    emailVerified,
  };
}

/**
 * Filters users by email search keyword (case-insensitive partial match).
 *
 * Requirement 3.3: Filter users by partial email match
 *
 * @param users - Array of users to filter
 * @param searchKeyword - Search keyword for email filtering
 * @returns Filtered array of users
 */
export function filterUsersByEmail(
  users: UserResponse[],
  searchKeyword: string
): UserResponse[] {
  if (!searchKeyword || searchKeyword.trim() === '') {
    return users;
  }

  const lowerKeyword = searchKeyword.toLowerCase();
  return users.filter((user) =>
    user.email.toLowerCase().includes(lowerKeyword)
  );
}

/**
 * Handler for GET /admin/users endpoint.
 *
 * Lists all Cognito users with pagination and optional search filtering.
 *
 * Query parameters:
 * - search: Optional email search keyword for filtering
 * - nextToken: Pagination token from previous response
 * - limit: Number of users per page (default: 50, max: 50)
 *
 * Requirements:
 * - 3.1: Display all Cognito users in a list
 * - 3.2: Display email, admin role, status, and creation date
 * - 3.3: Filter users by partial email match
 * - 3.4: Pagination with 50 users per page
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with user list
 */
export async function listUsersHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const client = getCognitoClient();
    const userPoolId = getUserPoolId();

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const searchKeyword = queryParams.search || '';
    const paginationToken = queryParams.nextToken;
    const requestedLimit = parseInt(queryParams.limit || '50', 10);

    // Enforce maximum limit of 50 users per page (Requirement 3.4)
    const limit = Math.min(Math.max(1, requestedLimit), 50);

    // Build ListUsers command
    // Note: Cognito ListUsers API supports server-side filtering with Filter parameter
    // but only for exact matches. For partial email match, we need client-side filtering.
    const commandInput: ListUsersCommandInput = {
      UserPoolId: userPoolId,
      Limit: 60, // Fetch more to account for client-side filtering
    };

    // Use pagination token if provided
    if (paginationToken) {
      commandInput.PaginationToken = paginationToken;
    }

    // If search keyword is provided, use Cognito's Filter for prefix matching
    // Note: Cognito Filter supports "email ^= 'prefix'" for prefix matching
    // For full partial match, we still need client-side filtering
    if (searchKeyword) {
      // Use Cognito's filter for email prefix matching (optimization)
      // This reduces the number of users fetched from Cognito
      // But we still do client-side filtering for full partial match
      commandInput.Filter = `email ^= "${searchKeyword}"`;
    }

    // Execute ListUsers command
    const response = await client.send(new ListUsersCommand(commandInput));

    // Convert Cognito users to UserResponse format
    let users = (response.Users || []).map(convertToUserResponse);

    // Apply client-side filtering for partial email match
    // This is needed because Cognito's Filter only supports prefix matching
    if (searchKeyword) {
      users = filterUsersByEmail(users, searchKeyword);
    }

    // Apply pagination limit
    const paginatedUsers = users.slice(0, limit);

    // Determine if there are more results
    // Note: We use Cognito's PaginationToken for server-side pagination
    // and also check if we have more users after client-side filtering
    const hasMoreResults =
      response.PaginationToken !== undefined || users.length > limit;

    const result: ListUsersResponse = {
      users: paginatedUsers,
    };

    // Include next token if there are more results
    if (hasMoreResults && response.PaginationToken) {
      result.nextToken = response.PaginationToken;
    }

    return createSuccessResponse(result);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Allows setting a custom Cognito client for testing purposes.
 *
 * @param client - Cognito client to use
 */
export function setCognitoClient(client: CognitoIdentityProviderClient): void {
  cognitoClient = client;
}

/**
 * Resets the Cognito client (useful for testing).
 */
export function resetCognitoClient(): void {
  cognitoClient = null;
}

/**
 * Request body for creating a user.
 */
export interface CreateUserRequest {
  /** User email address */
  email: string;
  /** Whether to grant admin role */
  isAdmin?: boolean;
}

/**
 * Request body for updating a user.
 */
export interface UpdateUserRequest {
  /** Whether to grant admin role */
  isAdmin?: boolean;
  /** Whether to enable/disable the user */
  enabled?: boolean;
}

/**
 * CSV bulk registration result for a single row.
 */
export interface BulkRegistrationResult {
  /** Row number in CSV (1-indexed) */
  row: number;
  /** Email address from CSV */
  email: string;
  /** Whether registration was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Response for bulk registration.
 */
export interface BulkRegistrationResponse {
  /** Total number of rows processed */
  totalRows: number;
  /** Number of successful registrations */
  successCount: number;
  /** Number of failed registrations */
  failureCount: number;
  /** Detailed results for each row */
  results: BulkRegistrationResult[];
}

/**
 * Validates email address format.
 *
 * @param email - Email address to validate
 * @returns true if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Handler for POST /admin/users endpoint.
 *
 * Creates a new user in Cognito with optional admin role.
 *
 * Request body:
 * - email: User email address (required)
 * - isAdmin: Whether to grant admin role (optional, default: false)
 *
 * Requirements:
 * - 3.5: Create new users with email
 * - 3.6: Set admin role based on isAdmin flag
 * - 5.1: Record audit log for user creation
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with created user
 */
export async function createUserHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const adminUserId = getAdminUserId(event) || 'unknown';
    const client = getCognitoClient();
    const userPoolId = getUserPoolId();

    // Parse request body
    if (!event.body) {
      return createBadRequestResponse('Request body is required');
    }

    let requestBody: CreateUserRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return createBadRequestResponse('Invalid JSON in request body');
    }

    // Validate email
    if (!requestBody.email) {
      return createBadRequestResponse('Email is required');
    }

    if (!isValidEmail(requestBody.email)) {
      return createBadRequestResponse('Invalid email format');
    }

    const email = requestBody.email.trim().toLowerCase();
    const isAdmin = requestBody.isAdmin === true;

    // Build user attributes
    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ];

    // Add admin role if requested
    if (isAdmin) {
      userAttributes.push({ Name: 'custom:role', Value: 'admin' });
    }

    // Create user in Cognito
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: userAttributes,
      MessageAction: MessageActionType.SUPPRESS, // Don't send welcome email
      DesiredDeliveryMediums: ['EMAIL'],
    });

    try {
      const response = await client.send(createCommand);

      // Record audit log
      await recordAuditLog({
        adminUserId,
        action: AuditAction.USER_CREATE,
        targetUserId: email,
        details: { isAdmin },
        context,
      });

      // Convert to UserResponse
      const user: UserResponse = {
        userId: response.User?.Username || email,
        email,
        isAdmin,
        status: 'active',
        createdAt:
          response.User?.UserCreateDate?.toISOString() ||
          new Date().toISOString(),
        emailVerified: true,
      };

      return createSuccessResponse({ user }, 201);
    } catch (error) {
      if (error instanceof UsernameExistsException) {
        return createBadRequestResponse('User with this email already exists');
      }
      throw error;
    }
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Handler for PUT /admin/users/{userId} endpoint.
 *
 * Updates user attributes (admin role, enabled status).
 *
 * Path parameters:
 * - userId: User ID (Cognito username)
 *
 * Request body:
 * - isAdmin: Whether to grant/revoke admin role (optional)
 * - enabled: Whether to enable/disable the user (optional)
 *
 * Requirements:
 * - 3.6: Grant admin role
 * - 3.7: Revoke admin role
 * - 3.8: Disable user
 * - 5.3: Record audit log for role changes
 * - 5.4: Record audit log for user disable
 * - 5.5: Record audit log for user enable
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with updated user
 */
export async function updateUserHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const adminUserId = getAdminUserId(event) || 'unknown';
    const client = getCognitoClient();
    const userPoolId = getUserPoolId();

    // Get user ID from path parameters
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return createBadRequestResponse('User ID is required');
    }

    // Parse request body
    if (!event.body) {
      return createBadRequestResponse('Request body is required');
    }

    let requestBody: UpdateUserRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return createBadRequestResponse('Invalid JSON in request body');
    }

    // Check if at least one update is requested
    if (
      requestBody.isAdmin === undefined &&
      requestBody.enabled === undefined
    ) {
      return createBadRequestResponse(
        'At least one of isAdmin or enabled must be provided'
      );
    }

    // Update admin role if requested
    if (requestBody.isAdmin !== undefined) {
      const userAttributes = requestBody.isAdmin
        ? [{ Name: 'custom:role', Value: 'admin' }]
        : [{ Name: 'custom:role', Value: '' }];

      await client.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: userId,
          UserAttributes: userAttributes,
        })
      );

      // Record audit log for role change
      await recordAuditLog({
        adminUserId,
        action: requestBody.isAdmin
          ? AuditAction.USER_GRANT_ADMIN
          : AuditAction.USER_REVOKE_ADMIN,
        targetUserId: userId,
        details: { isAdmin: requestBody.isAdmin },
        context,
      });
    }

    // Update enabled status if requested
    if (requestBody.enabled !== undefined) {
      if (requestBody.enabled) {
        await client.send(
          new AdminEnableUserCommand({
            UserPoolId: userPoolId,
            Username: userId,
          })
        );
      } else {
        await client.send(
          new AdminDisableUserCommand({
            UserPoolId: userPoolId,
            Username: userId,
          })
        );
      }

      // Record audit log for enable/disable
      await recordAuditLog({
        adminUserId,
        action: requestBody.enabled
          ? AuditAction.USER_ENABLE
          : AuditAction.USER_DISABLE,
        targetUserId: userId,
        details: { enabled: requestBody.enabled },
        context,
      });
    }

    return createSuccessResponse({
      message: 'User updated successfully',
      userId,
    });
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Handler for DELETE /admin/users/{userId} endpoint.
 *
 * Deletes a user from Cognito. DynamoDB data is preserved.
 *
 * Path parameters:
 * - userId: User ID (Cognito username)
 *
 * Requirements:
 * - 3.9: Delete user from Cognito
 * - 5.2: Record audit log for user deletion
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result
 */
export async function deleteUserHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const adminUserId = getAdminUserId(event) || 'unknown';
    const client = getCognitoClient();
    const userPoolId = getUserPoolId();

    // Get user ID from path parameters
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return createBadRequestResponse('User ID is required');
    }

    // Delete user from Cognito
    await client.send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: userId,
      })
    );

    // Record audit log
    await recordAuditLog({
      adminUserId,
      action: AuditAction.USER_DELETE,
      targetUserId: userId,
      details: {},
      context,
    });

    return createSuccessResponse({
      message: 'User deleted successfully',
      userId,
    });
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Parses CSV content into rows.
 *
 * Handles:
 * - UTF-8 BOM
 * - Empty lines
 * - Comment lines (starting with #)
 * - Header row (first row is skipped)
 *
 * Requirements:
 * - 16.8: UTF-8 BOM support
 * - 16.9: Skip empty lines
 * - 16.10: Skip comment lines
 *
 * @param csvContent - Raw CSV content
 * @returns Array of email addresses
 */
export function parseCSV(csvContent: string): string[] {
  // Remove UTF-8 BOM if present
  let content = csvContent;
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  // Split into lines
  const lines = content.split(/\r?\n/);

  // Process lines
  const emails: string[] = [];
  let isFirstLine = true;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      continue;
    }

    // Skip comment lines
    if (trimmedLine.startsWith('#')) {
      continue;
    }

    // Skip header row (first non-empty, non-comment line)
    if (isFirstLine) {
      isFirstLine = false;
      // Check if this looks like a header (contains "email" case-insensitive)
      if (trimmedLine.toLowerCase().includes('email')) {
        continue;
      }
    }

    // Extract email (first column if CSV has multiple columns)
    const columns = trimmedLine.split(',');
    const email = columns[0].trim().replace(/^["']|["']$/g, ''); // Remove quotes

    if (email) {
      emails.push(email);
    }
  }

  return emails;
}

/**
 * Handler for POST /admin/users/bulk endpoint.
 *
 * Bulk creates users from CSV content.
 *
 * Request body:
 * - csv: CSV content with email addresses
 * - isAdmin: Whether to grant admin role to all users (optional, default: false)
 *
 * Requirements:
 * - 3.12: Bulk user registration from CSV
 * - 3.13: Row-by-row error handling
 * - 16.8: UTF-8 BOM support
 * - 16.9: Skip empty lines
 * - 16.10: Skip comment lines
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with bulk registration results
 */
export async function bulkCreateUsersHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const adminUserId = getAdminUserId(event) || 'unknown';
    const client = getCognitoClient();
    const userPoolId = getUserPoolId();

    // Parse request body
    if (!event.body) {
      return createBadRequestResponse('Request body is required');
    }

    let requestBody: { csv: string; isAdmin?: boolean };
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return createBadRequestResponse('Invalid JSON in request body');
    }

    if (!requestBody.csv) {
      return createBadRequestResponse('CSV content is required');
    }

    const isAdmin = requestBody.isAdmin === true;

    // Parse CSV
    const emails = parseCSV(requestBody.csv);

    if (emails.length === 0) {
      return createBadRequestResponse('No valid email addresses found in CSV');
    }

    // Process each email
    const results: BulkRegistrationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i].toLowerCase().trim();
      const row = i + 2; // +2 because row 1 is header, and array is 0-indexed

      // Validate email
      if (!isValidEmail(email)) {
        results.push({
          row,
          email,
          success: false,
          error: 'Invalid email format',
        });
        failureCount++;
        continue;
      }

      // Build user attributes
      const userAttributes = [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ];

      if (isAdmin) {
        userAttributes.push({ Name: 'custom:role', Value: 'admin' });
      }

      try {
        // Create user in Cognito
        await client.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: userAttributes,
            MessageAction: MessageActionType.SUPPRESS,
            DesiredDeliveryMediums: ['EMAIL'],
          })
        );

        results.push({
          row,
          email,
          success: true,
        });
        successCount++;
      } catch (error) {
        let errorMessage = 'Unknown error';
        if (error instanceof UsernameExistsException) {
          errorMessage = 'User already exists';
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        results.push({
          row,
          email,
          success: false,
          error: errorMessage,
        });
        failureCount++;
      }
    }

    // Record audit log for bulk registration
    await recordAuditLog({
      adminUserId,
      action: AuditAction.USER_BULK_CREATE,
      targetUserId: 'bulk',
      details: {
        totalRows: emails.length,
        successCount,
        failureCount,
        isAdmin,
      },
      context,
    });

    const response: BulkRegistrationResponse = {
      totalRows: emails.length,
      successCount,
      failureCount,
      results,
    };

    return createSuccessResponse(response);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}
