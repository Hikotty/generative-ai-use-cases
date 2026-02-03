/**
 * Role check utility for admin Lambda functions.
 *
 * This module provides functions to verify that the requesting user
 * has the 'admin' role in their Cognito custom:role attribute.
 *
 * Requirements:
 * - 2.4: Allow access when user with custom:role='admin' accesses /admin/* endpoints
 * - 2.5: Return 403 error when user without admin role accesses /admin/* endpoints
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Result of role check operation.
 */
export interface RoleCheckResult {
  /** Whether the user has admin role */
  isAdmin: boolean;
  /** User ID (cognito:username) if available */
  userId?: string;
  /** User email if available */
  email?: string;
  /** The custom:role value */
  role?: string;
}

/**
 * Extracts claims from API Gateway event's authorizer context.
 *
 * @param event - API Gateway proxy event
 * @returns Claims object or undefined if not available
 */
export function extractClaims(
  event: APIGatewayProxyEvent
): Record<string, string> | undefined {
  return event.requestContext?.authorizer?.claims as
    | Record<string, string>
    | undefined;
}

/**
 * Checks if the requesting user has admin role.
 *
 * This function extracts the custom:role claim from the JWT token
 * and verifies that it equals 'admin'.
 *
 * Design reference:
 * ```typescript
 * // Execute at the beginning of each admin Lambda function
 * const role = event.requestContext.authorizer.claims['custom:role'];
 *
 * if (role !== 'admin') {
 *   return {
 *     statusCode: 403,
 *     body: JSON.stringify({ error: 'Forbidden: Admin role required' })
 *   };
 * }
 * ```
 *
 * @param event - API Gateway proxy event containing authorizer claims
 * @returns RoleCheckResult with isAdmin flag and user information
 *
 * @example
 * ```typescript
 * const result = checkAdminRole(event);
 * if (!result.isAdmin) {
 *   return createForbiddenResponse('Admin role required');
 * }
 * // Proceed with admin operation
 * ```
 */
export function checkAdminRole(event: APIGatewayProxyEvent): RoleCheckResult {
  const claims = extractClaims(event);

  if (!claims) {
    return {
      isAdmin: false,
    };
  }

  const role = claims['custom:role'];
  const userId = claims['cognito:username'];
  const email = claims['email'];

  return {
    isAdmin: role === 'admin',
    userId,
    email,
    role,
  };
}

/**
 * Gets the admin user ID from the event.
 *
 * This is a convenience function to extract the user ID
 * for audit logging purposes.
 *
 * @param event - API Gateway proxy event
 * @returns User ID or undefined if not available
 */
export function getAdminUserId(
  event: APIGatewayProxyEvent
): string | undefined {
  const claims = extractClaims(event);
  return claims?.['cognito:username'];
}

/**
 * Gets the admin user email from the event.
 *
 * @param event - API Gateway proxy event
 * @returns User email or undefined if not available
 */
export function getAdminEmail(event: APIGatewayProxyEvent): string | undefined {
  const claims = extractClaims(event);
  return claims?.['email'];
}
