/**
 * Audit log utilities for admin Lambda functions.
 *
 * This module provides functions to record audit logs for admin operations
 * in the DynamoDB Main Table.
 *
 * Requirements:
 * - 5.1: Record audit log when admin creates a user
 * - 5.2: Record audit log when admin deletes a user
 * - 5.3: Record audit log when admin grants admin role to a user
 * - 5.4: Record audit log when admin revokes admin role from a user
 * - 5.5: Record audit log when admin disables a user
 * - 5.6: Include action, target user ID, admin user ID, and timestamp in audit logs
 *
 * Design reference:
 * ```typescript
 * {
 *   PK: 'admin#<adminUserId>',
 *   SK: '<timestamp>',
 *   action: 'CREATE_USER' | 'DELETE_USER' | 'GRANT_ADMIN' | 'REVOKE_ADMIN' | 'DISABLE_USER',
 *   targetUserId: '<userId>',
 *   targetEmail: '<email>',
 *   details: { ... },
 *   timestamp: '<ISO 8601>'
 * }
 * ```
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Audit log action types.
 */
export type AuditAction =
  | 'CREATE_USER'
  | 'DELETE_USER'
  | 'GRANT_ADMIN'
  | 'REVOKE_ADMIN'
  | 'DISABLE_USER'
  | 'ENABLE_USER'
  | 'BULK_CREATE_USERS'
  | 'UPDATE_SETTINGS'
  | 'UPLOAD_DOCUMENT'
  | 'DELETE_DOCUMENT'
  | 'GENERATE_TEMPLATE';

/**
 * Audit log entry structure.
 */
export interface AuditLogEntry {
  /** Partition key: admin#<adminUserId> */
  id: string;
  /** Sort key: timestamp in ISO 8601 format */
  createdDate: string;
  /** Action type */
  action: AuditAction;
  /** Target user ID (for user-related actions) */
  targetUserId?: string;
  /** Target user email (for user-related actions) */
  targetEmail?: string;
  /** Additional details about the action */
  details?: Record<string, unknown>;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Admin user ID who performed the action */
  adminUserId: string;
  /** Admin user email who performed the action */
  adminEmail?: string;
}

/**
 * Parameters for recording an audit log.
 */
export interface RecordAuditLogParams {
  /** Admin user ID who performed the action */
  adminUserId: string;
  /** Admin user email (optional) */
  adminEmail?: string;
  /** Action type */
  action: AuditAction;
  /** Target user ID (for user-related actions) */
  targetUserId?: string;
  /** Target user email (for user-related actions) */
  targetEmail?: string;
  /** Additional details about the action */
  details?: Record<string, unknown>;
}

// DynamoDB client singleton
let dynamoDbDocument: DynamoDBDocumentClient | null = null;

/**
 * Gets or creates the DynamoDB Document client.
 *
 * @returns DynamoDB Document client
 */
function getDynamoDbClient(): DynamoDBDocumentClient {
  if (!dynamoDbDocument) {
    const dynamoDb = new DynamoDBClient({});
    dynamoDbDocument = DynamoDBDocumentClient.from(dynamoDb);
  }
  return dynamoDbDocument;
}

/**
 * Gets the table name from environment variable.
 *
 * @returns Table name
 * @throws Error if TABLE_NAME is not set
 */
function getTableName(): string {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME environment variable is not set');
  }
  return tableName;
}

/**
 * Records an audit log entry to DynamoDB.
 *
 * This function creates an audit log entry in the Main Table with the
 * following structure:
 * - PK (id): admin#<adminUserId>
 * - SK (createdDate): ISO 8601 timestamp
 *
 * Requirement 5.6: Include action, target user ID, admin user ID, and timestamp in audit logs
 *
 * @param params - Audit log parameters
 * @returns The created audit log entry
 *
 * @example
 * ```typescript
 * // Record user creation
 * await recordAuditLog({
 *   adminUserId: 'admin-user-123',
 *   adminEmail: 'admin@example.com',
 *   action: 'CREATE_USER',
 *   targetUserId: 'new-user-456',
 *   targetEmail: 'newuser@example.com',
 *   details: { isAdmin: false }
 * });
 * ```
 */
export async function recordAuditLog(
  params: RecordAuditLogParams
): Promise<AuditLogEntry> {
  const {
    adminUserId,
    adminEmail,
    action,
    targetUserId,
    targetEmail,
    details,
  } = params;

  const timestamp = new Date().toISOString();

  const entry: AuditLogEntry = {
    id: `admin#${adminUserId}`,
    createdDate: timestamp,
    action,
    timestamp,
    adminUserId,
  };

  // Add optional fields
  if (adminEmail) {
    entry.adminEmail = adminEmail;
  }

  if (targetUserId) {
    entry.targetUserId = targetUserId;
  }

  if (targetEmail) {
    entry.targetEmail = targetEmail;
  }

  if (details && Object.keys(details).length > 0) {
    entry.details = details;
  }

  const client = getDynamoDbClient();
  const tableName = getTableName();

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: entry,
    })
  );

  console.log('Audit log recorded:', {
    action,
    adminUserId,
    targetUserId,
    timestamp,
  });

  return entry;
}

/**
 * Records a user creation audit log.
 *
 * Requirement 5.1: Record audit log when admin creates a user
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param targetUserId - Created user ID
 * @param targetEmail - Created user email
 * @param isAdmin - Whether the created user has admin role
 * @returns The created audit log entry
 */
export async function recordUserCreation(
  adminUserId: string,
  adminEmail: string | undefined,
  targetUserId: string,
  targetEmail: string,
  isAdmin: boolean
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'CREATE_USER',
    targetUserId,
    targetEmail,
    details: { isAdmin },
  });
}

/**
 * Records a user deletion audit log.
 *
 * Requirement 5.2: Record audit log when admin deletes a user
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param targetUserId - Deleted user ID
 * @param targetEmail - Deleted user email
 * @returns The created audit log entry
 */
export async function recordUserDeletion(
  adminUserId: string,
  adminEmail: string | undefined,
  targetUserId: string,
  targetEmail: string
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'DELETE_USER',
    targetUserId,
    targetEmail,
  });
}

/**
 * Records an admin role grant audit log.
 *
 * Requirement 5.3: Record audit log when admin grants admin role to a user
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param targetUserId - User ID who received admin role
 * @param targetEmail - User email who received admin role
 * @returns The created audit log entry
 */
export async function recordAdminGrant(
  adminUserId: string,
  adminEmail: string | undefined,
  targetUserId: string,
  targetEmail: string
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'GRANT_ADMIN',
    targetUserId,
    targetEmail,
  });
}

/**
 * Records an admin role revocation audit log.
 *
 * Requirement 5.4: Record audit log when admin revokes admin role from a user
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param targetUserId - User ID who lost admin role
 * @param targetEmail - User email who lost admin role
 * @returns The created audit log entry
 */
export async function recordAdminRevoke(
  adminUserId: string,
  adminEmail: string | undefined,
  targetUserId: string,
  targetEmail: string
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'REVOKE_ADMIN',
    targetUserId,
    targetEmail,
  });
}

/**
 * Records a user disable audit log.
 *
 * Requirement 5.5: Record audit log when admin disables a user
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param targetUserId - Disabled user ID
 * @param targetEmail - Disabled user email
 * @returns The created audit log entry
 */
export async function recordUserDisable(
  adminUserId: string,
  adminEmail: string | undefined,
  targetUserId: string,
  targetEmail: string
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'DISABLE_USER',
    targetUserId,
    targetEmail,
  });
}

/**
 * Records a user enable audit log.
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param targetUserId - Enabled user ID
 * @param targetEmail - Enabled user email
 * @returns The created audit log entry
 */
export async function recordUserEnable(
  adminUserId: string,
  adminEmail: string | undefined,
  targetUserId: string,
  targetEmail: string
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'ENABLE_USER',
    targetUserId,
    targetEmail,
  });
}

/**
 * Records a bulk user creation audit log.
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param successCount - Number of successfully created users
 * @param failedCount - Number of failed user creations
 * @param details - Additional details about the bulk operation
 * @returns The created audit log entry
 */
export async function recordBulkUserCreation(
  adminUserId: string,
  adminEmail: string | undefined,
  successCount: number,
  failedCount: number,
  details?: Record<string, unknown>
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'BULK_CREATE_USERS',
    details: {
      successCount,
      failedCount,
      ...details,
    },
  });
}

/**
 * Records a document upload audit log.
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param documentName - Name of the uploaded document
 * @param documentSize - Size of the document in bytes
 * @returns The created audit log entry
 */
export async function recordDocumentUpload(
  adminUserId: string,
  adminEmail: string | undefined,
  documentName: string,
  documentSize: number
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'UPLOAD_DOCUMENT',
    details: {
      documentName,
      documentSize,
    },
  });
}

/**
 * Records a document deletion audit log.
 *
 * @param adminUserId - Admin user ID who performed the action
 * @param adminEmail - Admin user email
 * @param documentName - Name of the deleted document
 * @returns The created audit log entry
 */
export async function recordDocumentDeletion(
  adminUserId: string,
  adminEmail: string | undefined,
  documentName: string
): Promise<AuditLogEntry> {
  return recordAuditLog({
    adminUserId,
    adminEmail,
    action: 'DELETE_DOCUMENT',
    details: {
      documentName,
    },
  });
}

/**
 * Allows setting a custom DynamoDB client for testing purposes.
 *
 * @param client - DynamoDB Document client to use
 */
export function setDynamoDbClient(client: DynamoDBDocumentClient): void {
  dynamoDbDocument = client;
}

/**
 * Resets the DynamoDB client (useful for testing).
 */
export function resetDynamoDbClient(): void {
  dynamoDbDocument = null;
}
