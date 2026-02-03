/**
 * Application settings management Lambda handler for admin dashboard.
 *
 * This module provides handlers for application settings operations:
 * - GET /admin/settings: Get current application settings
 * - PUT /admin/settings: Update application settings
 * - POST /admin/settings/icon: Upload custom icon (generate presigned URL)
 *
 * Requirements:
 * - 18.1: Read current settings from S3 bucket and display
 * - 18.2: Allow editing of app name, use case titles, icons, welcome message
 * - 18.3: Accept image files (PNG, SVG, JPG) for icon upload
 * - 18.4: Validate image size (max 1MB)
 * - 18.5: Save settings file (JSON) to S3 bucket
 * - 18.6: Save icons to S3 and serve via CloudFront
 * - 18.7: Record audit log when settings are updated
 * - 18.10: Load latest settings from S3 on frontend startup
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  checkAdminRole,
  getAdminUserId,
  getAdminEmail,
} from '../utils/roleCheck';
import {
  createForbiddenResponse,
  createSuccessResponse,
  handleError,
  logError,
  createBadRequestResponse,
} from '../utils/errorResponse';
import { recordAuditLog, AuditAction } from '../utils/auditLog';

// S3 client singleton
let s3Client: S3Client | null = null;

/**
 * Gets or creates the S3 client.
 */
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({});
  }
  return s3Client;
}

/**
 * Gets the settings bucket name from environment variable.
 */
function getSettingsBucketName(): string {
  const bucketName = process.env.SETTINGS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('SETTINGS_BUCKET_NAME environment variable is not set');
  }
  return bucketName;
}

/**
 * The key for the app settings file in S3.
 */
export const APP_SETTINGS_KEY = 'app-settings.json';

/**
 * The prefix for custom icons in S3.
 */
export const CUSTOM_ICONS_PREFIX = 'custom-icons/';

/**
 * Supported icon file extensions.
 * Requirement 18.3: Accept image files (PNG, SVG, JPG)
 */
export const SUPPORTED_ICON_EXTENSIONS = ['.png', '.svg', '.jpg', '.jpeg'];

/**
 * Maximum icon file size in bytes (1MB).
 * Requirement 18.4: Validate image size (max 1MB)
 */
export const MAX_ICON_SIZE = 1 * 1024 * 1024;

/**
 * Use case configuration structure.
 */
export interface UseCaseConfig {
  /** Display title for the use case */
  title: string;
  /** Icon path or URL */
  icon: string;
  /** Whether the use case is enabled */
  enabled?: boolean;
}

/**
 * Application settings structure.
 *
 * Design reference:
 * ```json
 * {
 *   "appName": "Generative AI Use Cases",
 *   "welcomeMessage": "生成AIの様々なユースケースをお試しください",
 *   "useCases": {
 *     "chat": {
 *       "title": "チャット",
 *       "icon": "/icons/chat-icon.png"
 *     },
 *     "rag": {
 *       "title": "RAG",
 *       "icon": "https://bucket.s3.amazonaws.com/custom-icons/rag.svg"
 *     }
 *   },
 *   "updatedAt": "2025-01-22T10:00:00Z",
 *   "updatedBy": "admin@example.com"
 * }
 * ```
 */
export interface AppSettings {
  /** Application name displayed in header */
  appName: string;
  /** Welcome message displayed on home page */
  welcomeMessage: string;
  /** Use case configurations */
  useCases: Record<string, UseCaseConfig>;
  /** Last update timestamp in ISO 8601 format */
  updatedAt?: string;
  /** Email of the admin who last updated the settings */
  updatedBy?: string;
}

/**
 * Default application settings.
 * Used when settings file doesn't exist in S3.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Generative AI Use Cases',
  welcomeMessage: '生成AIの様々なユースケースをお試しください',
  useCases: {
    chat: {
      title: 'チャット',
      icon: '/icons/chat-icon.png',
      enabled: true,
    },
    rag: {
      title: 'RAG',
      icon: '/icons/rag-icon.png',
      enabled: true,
    },
    agent: {
      title: 'エージェント',
      icon: '/icons/agent-icon.png',
      enabled: true,
    },
    translate: {
      title: '翻訳',
      icon: '/icons/translate-icon.png',
      enabled: true,
    },
    summarize: {
      title: '要約',
      icon: '/icons/summarize-icon.png',
      enabled: true,
    },
    generate: {
      title: '文章生成',
      icon: '/icons/generate-icon.png',
      enabled: true,
    },
  },
};

/**
 * Icon upload request structure.
 */
export interface IconUploadRequest {
  /** File name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** Content type */
  contentType?: string;
}

/**
 * Icon upload response structure.
 */
export interface IconUploadResponse {
  /** Presigned URL for upload */
  uploadUrl: string;
  /** Icon URL to use in settings */
  iconUrl: string;
  /** Expiration time for the presigned URL */
  expiresAt: string;
}

/**
 * Gets the file extension from a file name.
 *
 * @param fileName - File name
 * @returns File extension (lowercase, including dot)
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) {
    return '';
  }
  return fileName.substring(lastDot).toLowerCase();
}

/**
 * Checks if a file extension is a supported icon format.
 *
 * Requirement 18.3: Accept image files (PNG, SVG, JPG)
 *
 * @param extension - File extension (including dot)
 * @returns true if supported, false otherwise
 */
export function isSupportedIconExtension(extension: string): boolean {
  return SUPPORTED_ICON_EXTENSIONS.includes(extension.toLowerCase());
}

/**
 * Validates icon file size.
 *
 * Requirement 18.4: Validate image size (max 1MB)
 *
 * @param fileSize - File size in bytes
 * @returns Validation result with error message if invalid
 */
export function validateIconSize(fileSize: number): {
  valid: boolean;
  error?: string;
} {
  if (fileSize <= 0) {
    return { valid: false, error: 'File size must be greater than 0' };
  }

  if (fileSize > MAX_ICON_SIZE) {
    return {
      valid: false,
      error: `Icon file size exceeds maximum limit of 1MB (${MAX_ICON_SIZE} bytes)`,
    };
  }

  return { valid: true };
}

/**
 * Validates application settings structure.
 *
 * @param settings - Settings object to validate
 * @returns Validation result with error message if invalid
 */
export function validateAppSettings(settings: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!settings || typeof settings !== 'object') {
    return { valid: false, error: 'Settings must be an object' };
  }

  const s = settings as Record<string, unknown>;

  // Validate appName
  if (s.appName !== undefined && typeof s.appName !== 'string') {
    return { valid: false, error: 'appName must be a string' };
  }

  // Validate welcomeMessage
  if (s.welcomeMessage !== undefined && typeof s.welcomeMessage !== 'string') {
    return { valid: false, error: 'welcomeMessage must be a string' };
  }

  // Validate useCases
  if (s.useCases !== undefined) {
    if (typeof s.useCases !== 'object' || s.useCases === null) {
      return { valid: false, error: 'useCases must be an object' };
    }

    const useCases = s.useCases as Record<string, unknown>;
    for (const [key, value] of Object.entries(useCases)) {
      if (typeof value !== 'object' || value === null) {
        return { valid: false, error: `useCases.${key} must be an object` };
      }

      const useCase = value as Record<string, unknown>;

      // Validate title
      if (useCase.title !== undefined && typeof useCase.title !== 'string') {
        return { valid: false, error: `useCases.${key}.title must be a string` };
      }

      // Validate icon
      if (useCase.icon !== undefined && typeof useCase.icon !== 'string') {
        return { valid: false, error: `useCases.${key}.icon must be a string` };
      }

      // Validate enabled
      if (
        useCase.enabled !== undefined &&
        typeof useCase.enabled !== 'boolean'
      ) {
        return {
          valid: false,
          error: `useCases.${key}.enabled must be a boolean`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Handler for GET /admin/settings endpoint.
 *
 * Gets the current application settings from S3.
 * Returns default settings if the file doesn't exist.
 *
 * Requirement 18.1: Read current settings from S3 bucket and display
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with settings
 */
export async function getSettingsHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const s3 = getS3Client();
    const bucketName = getSettingsBucketName();

    try {
      // Try to get settings from S3
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: APP_SETTINGS_KEY,
        })
      );

      // Parse the settings JSON
      const bodyContents = await response.Body?.transformToString();
      if (!bodyContents) {
        // Return default settings if file is empty
        return createSuccessResponse(DEFAULT_SETTINGS);
      }

      const settings = JSON.parse(bodyContents) as AppSettings;
      return createSuccessResponse(settings);
    } catch (error) {
      // If the file doesn't exist, return default settings
      if ((error as Error).name === 'NoSuchKey') {
        return createSuccessResponse(DEFAULT_SETTINGS);
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
 * Handler for PUT /admin/settings endpoint.
 *
 * Updates the application settings in S3.
 *
 * Requirements:
 * - 18.5: Save settings file (JSON) to S3 bucket
 * - 18.7: Record audit log when settings are updated
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result
 */
export async function updateSettingsHandler(
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
    const adminEmail = getAdminEmail(event);

    // Parse request body
    if (!event.body) {
      return createBadRequestResponse('Request body is required');
    }

    let requestBody: Partial<AppSettings>;
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return createBadRequestResponse('Invalid JSON in request body');
    }

    // Validate settings
    const validation = validateAppSettings(requestBody);
    if (!validation.valid) {
      return createBadRequestResponse(validation.error!);
    }

    const s3 = getS3Client();
    const bucketName = getSettingsBucketName();

    // Get current settings to merge with updates
    let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };
    try {
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: APP_SETTINGS_KEY,
        })
      );

      const bodyContents = await response.Body?.transformToString();
      if (bodyContents) {
        currentSettings = JSON.parse(bodyContents) as AppSettings;
      }
    } catch (error) {
      // If file doesn't exist, use default settings
      if ((error as Error).name !== 'NoSuchKey') {
        throw error;
      }
    }

    // Merge settings
    const updatedSettings: AppSettings = {
      ...currentSettings,
      ...requestBody,
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail || adminUserId,
    };

    // If useCases is provided, merge it properly
    if (requestBody.useCases) {
      updatedSettings.useCases = {
        ...currentSettings.useCases,
        ...requestBody.useCases,
      };
    }

    // Save settings to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: APP_SETTINGS_KEY,
        Body: JSON.stringify(updatedSettings, null, 2),
        ContentType: 'application/json',
      })
    );

    // Record audit log
    await recordAuditLog({
      adminUserId,
      adminEmail,
      action: AuditAction.SETTINGS_UPDATE,
      details: {
        changes: requestBody,
      },
      context,
    });

    return createSuccessResponse({
      message: 'Settings updated successfully',
      settings: updatedSettings,
    });
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Handler for POST /admin/settings/icon endpoint.
 *
 * Generates a presigned URL for uploading a custom icon.
 *
 * Requirements:
 * - 18.3: Accept image files (PNG, SVG, JPG)
 * - 18.4: Validate image size (max 1MB)
 * - 18.6: Save icons to S3 and serve via CloudFront
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with presigned URL
 */
export async function uploadIconHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    // Parse request body
    if (!event.body) {
      return createBadRequestResponse('Request body is required');
    }

    let requestBody: IconUploadRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return createBadRequestResponse('Invalid JSON in request body');
    }

    // Validate required fields
    if (!requestBody.fileName) {
      return createBadRequestResponse('fileName is required');
    }

    if (!requestBody.fileSize || requestBody.fileSize <= 0) {
      return createBadRequestResponse('fileSize must be a positive number');
    }

    const { fileName, fileSize, contentType } = requestBody;

    // Validate file extension
    const extension = getFileExtension(fileName);
    if (!extension) {
      return createBadRequestResponse('File must have an extension');
    }

    if (!isSupportedIconExtension(extension)) {
      return createBadRequestResponse(
        `Unsupported icon format. Supported formats: ${SUPPORTED_ICON_EXTENSIONS.join(', ')}`
      );
    }

    // Validate file size
    const sizeValidation = validateIconSize(fileSize);
    if (!sizeValidation.valid) {
      return createBadRequestResponse(sizeValidation.error!);
    }

    const s3 = getS3Client();
    const bucketName = getSettingsBucketName();

    // Generate unique icon key
    const timestamp = Date.now();
    const iconKey = `${CUSTOM_ICONS_PREFIX}${timestamp}-${fileName}`;

    // Determine content type
    let iconContentType = contentType;
    if (!iconContentType) {
      switch (extension) {
        case '.png':
          iconContentType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          iconContentType = 'image/jpeg';
          break;
        case '.svg':
          iconContentType = 'image/svg+xml';
          break;
        default:
          iconContentType = 'application/octet-stream';
      }
    }

    // Generate presigned URL for upload
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: iconKey,
      ContentType: iconContentType,
    });

    const expiresIn = 3600; // 1 hour
    const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Generate the icon URL (S3 URL that can be used in settings)
    const region = process.env.AWS_REGION || 'us-east-1';
    const iconUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${iconKey}`;

    const result: IconUploadResponse = {
      uploadUrl,
      iconUrl,
      expiresAt,
    };

    return createSuccessResponse(result, 201);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Allows setting a custom S3 client for testing purposes.
 *
 * @param client - S3 client to use
 */
export function setS3Client(client: S3Client): void {
  s3Client = client;
}

/**
 * Resets the S3 client (useful for testing).
 */
export function resetS3Client(): void {
  s3Client = null;
}
