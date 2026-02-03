import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  RestApi,
  CognitoUserPoolsAuthorizer,
  AuthorizationType,
  Cors,
  IResource,
  LambdaIntegration,
} from 'aws-cdk-lib/aws-apigateway';
import { LAMBDA_RUNTIME_NODEJS } from '../../consts';

/**
 * Properties for the AdminConstruct
 */
export interface AdminConstructProps {
  /**
   * Whether admin dashboard is enabled
   */
  readonly adminEnabled: boolean;

  /**
   * The Cognito User Pool to use for authentication
   */
  readonly userPool: cognito.IUserPool;

  /**
   * The main DynamoDB table for storing chat data and audit logs
   */
  readonly mainTable: dynamodb.ITable;

  /**
   * The stats DynamoDB table for storing token usage statistics
   */
  readonly statsTable: dynamodb.ITable;

  /**
   * The existing API Gateway REST API to extend with /admin/* endpoints
   */
  readonly api: RestApi;

  /**
   * Optional email address for the initial admin user
   * If provided, an admin user will be created during deployment
   */
  readonly initialAdminEmail?: string | null;

  /**
   * Whether RAG is enabled
   * If true, RAG document management endpoints will be created
   */
  readonly ragEnabled?: boolean;

  /**
   * The S3 bucket for RAG documents (Knowledge Base data source)
   * Required when ragEnabled is true
   */
  readonly ragBucket?: s3.IBucket;

  /**
   * The Knowledge Base ID for RAG
   * Required when ragEnabled is true
   */
  readonly knowledgeBaseId?: string;

  /**
   * The Data Source ID for RAG
   * Required when ragEnabled is true
   */
  readonly dataSourceId?: string;
}

/**
 * AdminConstruct creates all AWS resources required for the admin dashboard feature.
 *
 * This construct implements a conditional deployment pattern:
 * - When adminEnabled is false, no resources are created (early return)
 * - When adminEnabled is true, all admin-related resources are deployed
 *
 * Resources created:
 * - Lambda functions for user management, log viewing, statistics
 * - API Gateway endpoints (/admin/*)
 * - IAM roles with least privilege
 * - CDK Custom Resource for initial admin user creation (if initialAdminEmail is provided)
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 12.1, 12.2, 12.5, 12.6, 12.7
 */
export class AdminConstruct extends Construct {
  /**
   * The /admin resource on the API Gateway
   * Exposed for later Lambda function integration in subsequent tasks
   */
  public adminResource?: IResource;

  /**
   * The Cognito User Pools Authorizer for admin endpoints
   * Exposed for later Lambda function integration in subsequent tasks
   */
  public authorizer?: CognitoUserPoolsAuthorizer;

  /**
   * Common authorizer props for admin endpoints
   * Exposed for later Lambda function integration in subsequent tasks
   */
  public commonAuthorizerProps?: {
    authorizationType: AuthorizationType;
    authorizer: CognitoUserPoolsAuthorizer;
  };

  constructor(scope: Construct, id: string, props: AdminConstructProps) {
    super(scope, id);

    // Conditional deployment: early return if admin dashboard is disabled
    // Requirements: 1.2, 12.2
    if (!props.adminEnabled) {
      return;
    }

    // Task 3.1: Create API Gateway endpoints (/admin/*)
    // Requirements: 9.1, 9.2, 11.7
    this.createAdminApiEndpoints(props);

    // Task 2: Create initial admin user using CDK Custom Resource
    // Requirements: 1.5.2, 1.5.3, 1.5.4, 1.5.5, 1.5.6, 1.5.7, 1.5.9, 1.5.10
    if (props.initialAdminEmail) {
      this.createInitialAdminUser(props.userPool, props.initialAdminEmail);
    }

    // Task 4: Create user management Lambda functions
    // Requirements: 3.1, 3.2, 3.3, 3.4
    this.createUserManagementLambda(props);

    // Task 5: Create log viewer Lambda functions
    // Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
    this.createLogViewerLambda(props);

    // Task 8: Create RAG document management Lambda functions
    // Requirements: 20.1, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10, 20.11, 20.16, 20.17, 20.18, 20.21
    if (
      props.ragEnabled &&
      props.ragBucket &&
      props.knowledgeBaseId &&
      props.dataSourceId
    ) {
      this.createRagManagementLambda(props);
    }

    // TODO: Task 6 - Create stats/cost Lambda functions
    // TODO: Task 9 - Create CloudFormation template generation Lambda
    // TODO: Task 10 - Create app settings Lambda functions
  }

  /**
   * Creates the /admin/* API Gateway endpoints with Cognito Authorizer and CORS.
   *
   * This method extends the existing API Gateway with admin-specific endpoints.
   * All /admin/* endpoints use the same Cognito Authorizer as existing endpoints.
   *
   * Requirements:
   * - 9.1: Extend existing API Gateway + Lambda configuration with /admin/* endpoints
   * - 9.2: Apply Cognito Authorizer to all /admin/* endpoints
   * - 11.7: Configure CORS appropriately on API Gateway
   *
   * @param props - The AdminConstruct properties containing the API Gateway and User Pool
   */
  private createAdminApiEndpoints(props: AdminConstructProps): void {
    const { api, userPool } = props;

    // Create Cognito Authorizer for admin endpoints (same pattern as existing endpoints)
    // Requirement: 9.2
    // Note: restApi must be specified to attach the authorizer to the API
    this.authorizer = new CognitoUserPoolsAuthorizer(this, 'AdminAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'AdminCognitoAuthorizer',
    });

    // Attach the authorizer to the API Gateway
    this.authorizer._attachToApi(api);

    // Common authorizer props for all admin endpoints
    this.commonAuthorizerProps = {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: this.authorizer,
    };

    // Create /admin resource with CORS enabled
    // Requirements: 9.1, 11.7
    this.adminResource = api.root.addResource('admin', {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // Create sub-resources for admin endpoints
    // These will be used by Lambda functions in subsequent tasks

    // /admin/users - User management endpoints (Task 4)
    const usersResource = this.adminResource.addResource('users');
    // /admin/users/{userId} - Individual user operations
    usersResource.addResource('{userId}');
    // /admin/users/bulk - CSV bulk registration
    usersResource.addResource('bulk');

    // /admin/logs - Log viewing endpoints (Task 5)
    const logsResource = this.adminResource.addResource('logs');
    // /admin/logs/export - Log CSV export
    logsResource.addResource('export');

    // /admin/audit-logs - Audit log endpoints (Task 5)
    this.adminResource.addResource('audit-logs');

    // /admin/costs - Cost statistics endpoints (Task 6)
    this.adminResource.addResource('costs');

    // /admin/stats - Usage statistics endpoints (Task 6)
    this.adminResource.addResource('stats');

    // /admin/rag - RAG document management endpoints (Task 8)
    const ragResource = this.adminResource.addResource('rag');
    // /admin/rag/documents - Document list and upload
    const ragDocumentsResource = ragResource.addResource('documents');
    // /admin/rag/documents/{documentId} - Individual document operations
    ragDocumentsResource.addResource('{documentId}');
    // /admin/rag/sync-status - Sync job status
    ragResource.addResource('sync-status');
    // /admin/rag/sync - Start sync job
    ragResource.addResource('sync');

    // /admin/deploy - CloudFormation template generation endpoints (Task 9)
    const deployResource = this.adminResource.addResource('deploy');
    // /admin/deploy/generate - Generate CloudFormation template
    deployResource.addResource('generate');

    // /admin/settings - Application settings endpoints (Task 10)
    this.adminResource.addResource('settings');
  }

  /**
   * Creates the initial admin user using a CDK Custom Resource.
   *
   * This method creates a Lambda function that uses the Cognito AdminCreateUser API
   * to create the initial admin user during stack deployment.
   *
   * Requirements:
   * - 1.5.2: Use CDK Custom Resource to create initial admin during first deployment
   * - 1.5.3: Use AdminCreateUser API to create user
   * - 1.5.4: Set custom:role attribute to 'admin'
   * - 1.5.5: Set email_verified attribute to 'true'
   * - 1.5.6: Generate random temporary password and send via email
   * - 1.5.7: Handle UsernameExistsException for idempotency
   * - 1.5.9: Do not execute if adminEnabled is false (handled by parent condition)
   * - 1.5.10: Skip if initialAdminEmail is not set (handled by parent condition)
   *
   * @param userPool - The Cognito User Pool to create the admin user in
   * @param email - The email address for the initial admin user
   */
  private createInitialAdminUser(
    userPool: cognito.IUserPool,
    email: string
  ): void {
    // Create Lambda function for the custom resource
    // Requirements: 1.5.3, 1.5.4, 1.5.5, 1.5.6, 1.5.7
    const createAdminUserFunction = new NodejsFunction(
      this,
      'CreateAdminUserFunction',
      {
        runtime: LAMBDA_RUNTIME_NODEJS,
        entry: './lambda/create-admin-user.ts',
        handler: 'onEvent',
        timeout: cdk.Duration.minutes(2),
        description:
          'CDK Custom Resource handler for creating initial admin user',
      }
    );

    // Grant the Lambda function permission to create users in Cognito
    // Using least privilege principle - only AdminCreateUser permission
    createAdminUserFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:AdminCreateUser'],
        resources: [userPool.userPoolArn],
      })
    );

    // Create the Custom Resource
    // Requirement: 1.5.2
    new cdk.CustomResource(this, 'InitialAdminUser', {
      serviceToken: createAdminUserFunction.functionArn,
      resourceType: 'Custom::InitialAdminUser',
      properties: {
        UserPoolId: userPool.userPoolId,
        Email: email,
      },
    });
  }

  /**
   * Creates the user management Lambda function and integrates it with API Gateway.
   *
   * This method creates a Lambda function that handles:
   * - GET /admin/users: List all users with pagination and search filtering
   *
   * Requirements:
   * - 3.1: Display all Cognito users in a list
   * - 3.2: Display email, admin role, status, and creation date for each user
   * - 3.3: Filter users by partial email match
   * - 3.4: Pagination with 50 users per page
   *
   * @param props - The AdminConstruct properties
   */
  private createUserManagementLambda(props: AdminConstructProps): void {
    const { userPool, mainTable } = props;

    // Create Lambda function for user management
    const listUsersFunction = new NodejsFunction(this, 'ListUsersFunction', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: './lambda/admin/handlers/users.ts',
      handler: 'listUsersHandler',
      timeout: cdk.Duration.seconds(30),
      description: 'Admin dashboard: List users with pagination and search',
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        TABLE_NAME: mainTable.tableName,
      },
    });

    // Grant the Lambda function permission to list users in Cognito
    // Using least privilege principle
    listUsersFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:ListUsers'],
        resources: [userPool.userPoolArn],
      })
    );

    // Grant read access to main table for audit logging
    mainTable.grantReadData(listUsersFunction);

    // Get the /admin/users resource
    const usersResource = this.adminResource!.getResource('users');
    if (!usersResource) {
      throw new Error('Users resource not found');
    }

    // Add GET method for listing users
    usersResource.addMethod(
      'GET',
      new LambdaIntegration(listUsersFunction),
      this.commonAuthorizerProps
    );
  }

  /**
   * Creates the log viewer Lambda function and integrates it with API Gateway.
   *
   * This method creates a Lambda function that handles:
   * - GET /admin/logs: Retrieve usage logs with filtering and pagination
   *
   * Requirements:
   * - 4.1: Display message data from Main Table
   * - 4.2: Display timestamp, userId, prompt, response for each log
   * - 4.3: Filter by date range
   * - 4.4: Filter by userId
   * - 4.5: Pagination with 100 logs per page
   * - 10.1: Query Main Table for logs
   * - 10.4: Use FilterExpression for user filtering
   * - 10.5: Use LastEvaluatedKey for pagination
   *
   * @param props - The AdminConstruct properties
   */
  private createLogViewerLambda(props: AdminConstructProps): void {
    const { mainTable } = props;

    // Create Lambda function for log viewing
    const listLogsFunction = new NodejsFunction(this, 'ListLogsFunction', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: './lambda/admin/handlers/logs.ts',
      handler: 'listLogsHandler',
      timeout: cdk.Duration.seconds(30),
      description:
        'Admin dashboard: List usage logs with filtering and pagination',
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
      },
    });

    // Grant read access to main table for querying logs
    mainTable.grantReadData(listLogsFunction);

    // Get the /admin/logs resource
    const logsResource = this.adminResource!.getResource('logs');
    if (!logsResource) {
      throw new Error('Logs resource not found');
    }

    // Add GET method for listing logs
    logsResource.addMethod(
      'GET',
      new LambdaIntegration(listLogsFunction),
      this.commonAuthorizerProps
    );
  }

  /**
   * Creates the RAG document management Lambda functions and integrates them with API Gateway.
   *
   * This method creates Lambda functions that handle:
   * - GET /admin/rag/sync-status: Get sync job status
   * - GET /admin/rag/documents: List documents
   * - POST /admin/rag/documents: Upload document (presigned URL)
   * - DELETE /admin/rag/documents/{documentId}: Delete document
   * - GET /admin/rag/documents/{documentId}/download: Download document
   *
   * Requirements:
   * - 20.1: Check current sync job status using ListIngestionJobs API
   * - 20.4: Display document list from Knowledge Base data source
   * - 20.5: Display file name, size, upload date, status
   * - 20.6: Show file selection dialog
   * - 20.7: Accept supported file formats
   * - 20.8: Validate text document size (max 50MB)
   * - 20.9: Validate image file size (max 3.75MB)
   * - 20.10: Save files to Bedrock Knowledge Base data source S3 bucket
   * - 20.11: Start sync using StartIngestionJob API
   * - 20.16: Delete document from S3 and re-sync
   * - 20.17: Download document from S3
   * - 20.18: Record audit logs
   * - 20.21: Search documents by file name
   *
   * @param props - The AdminConstruct properties
   */
  private createRagManagementLambda(props: AdminConstructProps): void {
    const { mainTable, ragBucket, knowledgeBaseId, dataSourceId } = props;

    if (!ragBucket || !knowledgeBaseId || !dataSourceId) {
      throw new Error(
        'RAG bucket, Knowledge Base ID, and Data Source ID are required'
      );
    }

    // Common environment variables for RAG Lambda functions
    const ragEnvironment = {
      RAG_BUCKET_NAME: ragBucket.bucketName,
      KNOWLEDGE_BASE_ID: knowledgeBaseId,
      DATA_SOURCE_ID: dataSourceId,
      TABLE_NAME: mainTable.tableName,
    };

    // Create Lambda function for sync status
    const getSyncStatusFunction = new NodejsFunction(
      this,
      'GetSyncStatusFunction',
      {
        runtime: LAMBDA_RUNTIME_NODEJS,
        entry: './lambda/admin/handlers/rag.ts',
        handler: 'getSyncStatusHandler',
        timeout: cdk.Duration.seconds(30),
        description: 'Admin dashboard: Get RAG sync job status',
        environment: ragEnvironment,
      }
    );

    // Create Lambda function for listing documents
    const listDocumentsFunction = new NodejsFunction(
      this,
      'ListDocumentsFunction',
      {
        runtime: LAMBDA_RUNTIME_NODEJS,
        entry: './lambda/admin/handlers/rag.ts',
        handler: 'listDocumentsHandler',
        timeout: cdk.Duration.seconds(30),
        description: 'Admin dashboard: List RAG documents',
        environment: ragEnvironment,
      }
    );

    // Create Lambda function for uploading documents
    const uploadDocumentFunction = new NodejsFunction(
      this,
      'UploadDocumentFunction',
      {
        runtime: LAMBDA_RUNTIME_NODEJS,
        entry: './lambda/admin/handlers/rag.ts',
        handler: 'uploadDocumentHandler',
        timeout: cdk.Duration.seconds(30),
        description: 'Admin dashboard: Upload RAG document (presigned URL)',
        environment: ragEnvironment,
      }
    );

    // Create Lambda function for deleting documents
    const deleteDocumentFunction = new NodejsFunction(
      this,
      'DeleteDocumentFunction',
      {
        runtime: LAMBDA_RUNTIME_NODEJS,
        entry: './lambda/admin/handlers/rag.ts',
        handler: 'deleteDocumentHandler',
        timeout: cdk.Duration.seconds(30),
        description: 'Admin dashboard: Delete RAG document',
        environment: ragEnvironment,
      }
    );

    // Create Lambda function for downloading documents
    const downloadDocumentFunction = new NodejsFunction(
      this,
      'DownloadDocumentFunction',
      {
        runtime: LAMBDA_RUNTIME_NODEJS,
        entry: './lambda/admin/handlers/rag.ts',
        handler: 'downloadDocumentHandler',
        timeout: cdk.Duration.seconds(30),
        description: 'Admin dashboard: Download RAG document',
        environment: ragEnvironment,
      }
    );

    // Grant permissions for Bedrock Agent API (ListIngestionJobs, StartIngestionJob)
    const bedrockAgentPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:ListIngestionJobs',
        'bedrock:StartIngestionJob',
        'bedrock:GetIngestionJob',
      ],
      resources: [
        `arn:aws:bedrock:*:*:knowledge-base/${knowledgeBaseId}`,
        `arn:aws:bedrock:*:*:knowledge-base/${knowledgeBaseId}/data-source/${dataSourceId}`,
      ],
    });

    getSyncStatusFunction.addToRolePolicy(bedrockAgentPolicy);
    uploadDocumentFunction.addToRolePolicy(bedrockAgentPolicy);
    deleteDocumentFunction.addToRolePolicy(bedrockAgentPolicy);

    // Grant S3 permissions
    ragBucket.grantRead(listDocumentsFunction);
    ragBucket.grantRead(downloadDocumentFunction);
    ragBucket.grantReadWrite(uploadDocumentFunction);
    ragBucket.grantDelete(deleteDocumentFunction);
    ragBucket.grantRead(deleteDocumentFunction);

    // Grant write access to main table for audit logging
    mainTable.grantWriteData(uploadDocumentFunction);
    mainTable.grantWriteData(deleteDocumentFunction);

    // Get the /admin/rag resource
    const ragResource = this.adminResource!.getResource('rag');
    if (!ragResource) {
      throw new Error('RAG resource not found');
    }

    // Get sub-resources
    const syncStatusResource = ragResource.getResource('sync-status');
    const documentsResource = ragResource.getResource('documents');
    const documentIdResource = documentsResource?.getResource('{documentId}');

    if (!syncStatusResource || !documentsResource || !documentIdResource) {
      throw new Error('RAG sub-resources not found');
    }

    // Add GET method for sync status
    syncStatusResource.addMethod(
      'GET',
      new LambdaIntegration(getSyncStatusFunction),
      this.commonAuthorizerProps
    );

    // Add GET method for listing documents
    documentsResource.addMethod(
      'GET',
      new LambdaIntegration(listDocumentsFunction),
      this.commonAuthorizerProps
    );

    // Add POST method for uploading documents
    documentsResource.addMethod(
      'POST',
      new LambdaIntegration(uploadDocumentFunction),
      this.commonAuthorizerProps
    );

    // Add DELETE method for deleting documents
    documentIdResource.addMethod(
      'DELETE',
      new LambdaIntegration(deleteDocumentFunction),
      this.commonAuthorizerProps
    );

    // Add download endpoint: /admin/rag/documents/{documentId}/download
    const downloadResource = documentIdResource.addResource('download');
    downloadResource.addMethod(
      'GET',
      new LambdaIntegration(downloadDocumentFunction),
      this.commonAuthorizerProps
    );
  }
}
