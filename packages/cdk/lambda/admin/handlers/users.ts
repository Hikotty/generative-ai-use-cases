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
} from '@aws-sdk/client-cognito-identity-provider';
import { checkAdminRole, getAdminUserId } from '../utils/roleCheck';
import {
  createForbiddenResponse,
  createSuccessResponse,
  handleError,
  logError,
} from '../utils/errorResponse';

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
    const adminUserId = getAdminUserId(event);
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
