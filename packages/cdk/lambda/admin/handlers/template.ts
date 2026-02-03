/**
 * CloudFormation template generation Lambda handler for admin dashboard.
 *
 * This module provides handlers for CloudFormation template generation operations:
 * - POST /admin/deploy/generate: Generate CloudFormation template from parameters
 * - GET /admin/deploy/history: Get template generation history
 *
 * Requirements:
 * - 19.1: Execute cdk synth in Lambda or CodeBuild when generate button is clicked
 * - 19.2: Generate CloudFormation template using parameters from admin dashboard
 * - 19.3: Save generated YAML file to S3 bucket
 * - 19.4: Display download link in admin dashboard when template is saved to S3
 * - 19.5: Download CloudFormation template (YAML) when download link is clicked
 * - 19.6: Generate CloudFormation Quick Create Link URL
 * - 19.7: Display "Open in CloudFormation Console" button when Quick Create Link is generated
 * - 19.8: Open CloudFormation console with pre-configured template and parameters
 * - 19.9: Provide template download link for manual upload
 * - 19.11: Record template generation history for re-download
 * - 19.12: Display generation date, executor, parameters, Quick Create Link URL
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
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

// DynamoDB client singleton
let dynamoDbDocument: DynamoDBDocumentClient | null = null;

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
 * Gets or creates the DynamoDB Document client.
 */
function getDynamoDbClient(): DynamoDBDocumentClient {
  if (!dynamoDbDocument) {
    const dynamoDb = new DynamoDBClient({});
    dynamoDbDocument = DynamoDBDocumentClient.from(dynamoDb);
  }
  return dynamoDbDocument;
}

/**
 * Gets the template bucket name from environment variable.
 */
function getTemplateBucketName(): string {
  const bucketName = process.env.TEMPLATE_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('TEMPLATE_BUCKET_NAME environment variable is not set');
  }
  return bucketName;
}

/**
 * Gets the table name from environment variable.
 */
function getTableName(): string {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME environment variable is not set');
  }
  return tableName;
}

/**
 * Gets the AWS region from environment variable.
 */
function getAwsRegion(): string {
  return process.env.AWS_REGION || 'us-east-1';
}

/**
 * Deploy parameters that can be configured in the admin dashboard.
 */
export interface DeployParameters {
  /** Whether RAG is enabled */
  ragEnabled?: boolean;
  /** Whether Agent is enabled */
  agentEnabled?: boolean;
  /** Whether Use Case Builder is enabled */
  useCaseBuilderEnabled?: boolean;
  /** Search API key */
  searchApiKey?: string;
  /** Model ID to use */
  modelId?: string;
  /** Stack name for CloudFormation */
  stackName?: string;
  /** Additional parameters */
  [key: string]: unknown;
}

/**
 * Template generation request structure.
 */
export interface GenerateTemplateRequest {
  /** Deploy parameters */
  parameters: DeployParameters;
}

/**
 * Template generation response structure.
 */
export interface GenerateTemplateResponse {
  /** Quick Create Link URL for CloudFormation console */
  quickCreateLink: string;
  /** Direct download link for the template */
  downloadLink: string;
  /** Template key in S3 */
  templateKey: string;
  /** Generation timestamp */
  generatedAt: string;
  /** Stack name */
  stackName: string;
}

/**
 * Template generation history entry.
 */
export interface TemplateHistoryEntry {
  /** Partition key: template#history */
  id: string;
  /** Sort key: timestamp */
  createdDate: string;
  /** Admin user ID who generated the template */
  adminUserId: string;
  /** Admin user email */
  adminEmail?: string;
  /** Deploy parameters used */
  parameters: DeployParameters;
  /** Quick Create Link URL */
  quickCreateLink: string;
  /** Download link */
  downloadLink: string;
  /** Template key in S3 */
  templateKey: string;
  /** Stack name */
  stackName: string;
}

/**
 * Validates deploy parameters.
 *
 * @param parameters - Deploy parameters to validate
 * @returns Validation result with error message if invalid
 */
export function validateDeployParameters(parameters: DeployParameters): {
  valid: boolean;
  error?: string;
} {
  if (!parameters || typeof parameters !== 'object') {
    return { valid: false, error: 'Parameters must be an object' };
  }

  // Validate boolean parameters
  const booleanParams = ['ragEnabled', 'agentEnabled', 'useCaseBuilderEnabled'];
  for (const param of booleanParams) {
    if (
      parameters[param] !== undefined &&
      typeof parameters[param] !== 'boolean'
    ) {
      return { valid: false, error: `${param} must be a boolean` };
    }
  }

  // Validate string parameters
  const stringParams = ['searchApiKey', 'modelId', 'stackName'];
  for (const param of stringParams) {
    if (
      parameters[param] !== undefined &&
      typeof parameters[param] !== 'string'
    ) {
      return { valid: false, error: `${param} must be a string` };
    }
  }

  // Validate stack name format if provided
  if (parameters.stackName) {
    const stackNameRegex = /^[a-zA-Z][a-zA-Z0-9-]*$/;
    if (!stackNameRegex.test(parameters.stackName)) {
      return {
        valid: false,
        error:
          'Stack name must start with a letter and contain only alphanumeric characters and hyphens',
      };
    }
    if (parameters.stackName.length > 128) {
      return {
        valid: false,
        error: 'Stack name must be 128 characters or less',
      };
    }
  }

  return { valid: true };
}

/**
 * Generates a CloudFormation Quick Create Link URL.
 *
 * Quick Create Link format:
 * https://<region>.console.aws.amazon.com/cloudformation/home?region=<region>#/stacks/create/review?templateURL=<encoded-s3-url>&stackName=<stack-name>
 *
 * Requirements:
 * - 19.6: Generate CloudFormation Quick Create Link URL
 * - 19.8: Open CloudFormation console with pre-configured template and parameters
 *
 * @param region - AWS region
 * @param templateS3Url - S3 URL of the template
 * @param stackName - Stack name
 * @returns Quick Create Link URL
 */
export function generateQuickCreateLink(
  region: string,
  templateS3Url: string,
  stackName: string
): string {
  const encodedTemplateUrl = encodeURIComponent(templateS3Url);
  const encodedStackName = encodeURIComponent(stackName);

  return (
    `https://${region}.console.aws.amazon.com/cloudformation/home` +
    `?region=${region}#/stacks/create/review` +
    `?templateURL=${encodedTemplateUrl}` +
    `&stackName=${encodedStackName}`
  );
}

/**
 * Generates an S3 URL for a template.
 *
 * @param region - AWS region
 * @param bucketName - S3 bucket name
 * @param templateKey - Template key in S3
 * @returns S3 URL
 */
export function generateS3Url(
  region: string,
  bucketName: string,
  templateKey: string
): string {
  return `https://s3.${region}.amazonaws.com/${bucketName}/${templateKey}`;
}

/**
 * Generates a mock CloudFormation template.
 *
 * Note: In a real implementation, this would execute `cdk synth` to generate
 * the actual CloudFormation template. For this implementation, we generate
 * a placeholder template that demonstrates the structure.
 *
 * Requirements:
 * - 19.1: Execute cdk synth in Lambda or CodeBuild
 * - 19.2: Generate CloudFormation template using parameters
 *
 * @param parameters - Deploy parameters
 * @returns CloudFormation template YAML content
 */
export function generateTemplateContent(parameters: DeployParameters): string {
  const timestamp = new Date().toISOString();
  const stackName = parameters.stackName || 'GenU-Stack';

  // Generate a CloudFormation template structure
  // In production, this would be the output of `cdk synth`
  const template = {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `GenU Stack - Generated at ${timestamp}`,
    Metadata: {
      GeneratedBy: 'GenU Admin Dashboard',
      GeneratedAt: timestamp,
      Parameters: parameters,
    },
    Parameters: {
      RagEnabled: {
        Type: 'String',
        Default: String(parameters.ragEnabled ?? false),
        AllowedValues: ['true', 'false'],
        Description: 'Enable RAG functionality',
      },
      AgentEnabled: {
        Type: 'String',
        Default: String(parameters.agentEnabled ?? false),
        AllowedValues: ['true', 'false'],
        Description: 'Enable Agent functionality',
      },
      UseCaseBuilderEnabled: {
        Type: 'String',
        Default: String(parameters.useCaseBuilderEnabled ?? false),
        AllowedValues: ['true', 'false'],
        Description: 'Enable Use Case Builder functionality',
      },
      ModelId: {
        Type: 'String',
        Default: parameters.modelId || 'anthropic.claude-sonnet-4-20250514',
        Description: 'Bedrock model ID to use',
      },
    },
    Resources: {
      // Placeholder resources - in production, these would be actual CDK-generated resources
      PlaceholderResource: {
        Type: 'AWS::CloudFormation::WaitConditionHandle',
        Metadata: {
          Comment: `This is a placeholder template for ${stackName}. In production, this would contain the actual CDK-synthesized resources.`,
        },
      },
    },
    Outputs: {
      StackName: {
        Description: 'Stack Name',
        Value: { Ref: 'AWS::StackName' },
      },
      GeneratedAt: {
        Description: 'Template generation timestamp',
        Value: timestamp,
      },
    },
  };

  // Convert to YAML-like format (simplified JSON for this implementation)
  // In production, this would be actual YAML from cdk synth
  return JSON.stringify(template, null, 2);
}

/**
 * Handler for POST /admin/deploy/generate endpoint.
 *
 * Generates a CloudFormation template from the provided parameters,
 * saves it to S3, and returns Quick Create Link and download URLs.
 *
 * Request body:
 * - parameters: Deploy parameters object
 *
 * Requirements:
 * - 19.1: Execute cdk synth in Lambda or CodeBuild
 * - 19.2: Generate CloudFormation template using parameters
 * - 19.3: Save generated YAML file to S3 bucket
 * - 19.4: Display download link in admin dashboard
 * - 19.6: Generate CloudFormation Quick Create Link URL
 * - 19.11: Record template generation history
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with Quick Create Link and download URL
 */
export async function generateTemplateHandler(
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

    let requestBody: GenerateTemplateRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return createBadRequestResponse('Invalid JSON in request body');
    }

    // Validate parameters
    if (!requestBody.parameters) {
      return createBadRequestResponse('Parameters are required');
    }

    const validation = validateDeployParameters(requestBody.parameters);
    if (!validation.valid) {
      return createBadRequestResponse(validation.error!);
    }

    const parameters = requestBody.parameters;
    const stackName = parameters.stackName || 'GenU-Stack';
    const region = getAwsRegion();
    const bucketName = getTemplateBucketName();
    const tableName = getTableName();

    // Generate template content
    const templateContent = generateTemplateContent(parameters);

    // Generate unique template key
    const timestamp = Date.now();
    const templateKey = `cfn-templates/${timestamp}-${stackName}.json`;

    // Save template to S3
    const s3 = getS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: templateKey,
        Body: templateContent,
        ContentType: 'application/json',
      })
    );

    // Generate URLs
    const templateS3Url = generateS3Url(region, bucketName, templateKey);
    const quickCreateLink = generateQuickCreateLink(
      region,
      templateS3Url,
      stackName
    );

    // Generate presigned download URL
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: templateKey,
    });
    const downloadLink = await getSignedUrl(s3, getCommand, {
      expiresIn: 3600,
    });

    const generatedAt = new Date().toISOString();

    // Record history in DynamoDB
    const dynamoDb = getDynamoDbClient();
    const historyEntry: TemplateHistoryEntry = {
      id: 'template#history',
      createdDate: generatedAt,
      adminUserId,
      adminEmail,
      parameters,
      quickCreateLink,
      downloadLink: templateS3Url, // Store the permanent S3 URL, not the presigned URL
      templateKey,
      stackName,
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: tableName,
        Item: historyEntry,
      })
    );

    // Record audit log
    await recordAuditLog({
      adminUserId,
      adminEmail,
      action: AuditAction.TEMPLATE_GENERATE,
      details: {
        stackName,
        templateKey,
        parameters,
      },
      context,
    });

    const response: GenerateTemplateResponse = {
      quickCreateLink,
      downloadLink,
      templateKey,
      generatedAt,
      stackName,
    };

    return createSuccessResponse(response, 201);
  } catch (error) {
    const adminUserId = getAdminUserId(event) || 'unknown';
    logError(error, context, adminUserId);
    return handleError(error, context, adminUserId);
  }
}

/**
 * Handler for GET /admin/deploy/history endpoint.
 *
 * Retrieves template generation history from DynamoDB.
 *
 * Query parameters:
 * - limit: Number of history entries to return (default: 10, max: 50)
 *
 * Requirements:
 * - 19.11: Record template generation history for re-download
 * - 19.12: Display generation date, executor, parameters, Quick Create Link URL
 *
 * @param event - API Gateway proxy event
 * @param context - Lambda context
 * @returns API Gateway proxy result with history entries
 */
export async function getTemplateHistoryHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Check admin role
    const roleCheck = checkAdminRole(event);
    if (!roleCheck.isAdmin) {
      return createForbiddenResponse();
    }

    const tableName = getTableName();
    const dynamoDb = getDynamoDbClient();

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const requestedLimit = parseInt(queryParams.limit || '10', 10);
    const limit = Math.min(Math.max(1, requestedLimit), 50);

    // Query history from DynamoDB
    const response = await dynamoDb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: {
          ':id': 'template#history',
        },
        ScanIndexForward: false, // Sort by createdDate descending
        Limit: limit,
      })
    );

    const history = (response.Items || []) as TemplateHistoryEntry[];

    // Generate fresh presigned URLs for download
    const s3 = getS3Client();
    const bucketName = getTemplateBucketName();

    const historyWithFreshUrls = await Promise.all(
      history.map(async (entry) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: entry.templateKey,
          });
          const freshDownloadLink = await getSignedUrl(s3, getCommand, {
            expiresIn: 3600,
          });
          return {
            ...entry,
            downloadLink: freshDownloadLink,
          };
        } catch {
          // If template no longer exists, return entry without fresh URL
          return entry;
        }
      })
    );

    return createSuccessResponse({
      history: historyWithFreshUrls,
      count: historyWithFreshUrls.length,
    });
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
