import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
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
   * Optional email address for the initial admin user
   * If provided, an admin user will be created during deployment
   */
  readonly initialAdminEmail?: string | null;
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
  constructor(scope: Construct, id: string, props: AdminConstructProps) {
    super(scope, id);

    // Conditional deployment: early return if admin dashboard is disabled
    // Requirements: 1.2, 12.2
    if (!props.adminEnabled) {
      return;
    }

    // Task 2: Create initial admin user using CDK Custom Resource
    // Requirements: 1.5.2, 1.5.3, 1.5.4, 1.5.5, 1.5.6, 1.5.7, 1.5.9, 1.5.10
    if (props.initialAdminEmail) {
      this.createInitialAdminUser(props.userPool, props.initialAdminEmail);
    }

    // TODO: Task 3 - Create API Gateway endpoints (/admin/*)
    // TODO: Task 4 - Create user management Lambda functions
    // TODO: Task 5 - Create log viewer Lambda functions
    // TODO: Task 6 - Create stats/cost Lambda functions
    // TODO: Task 8 - Create RAG document management Lambda functions
    // TODO: Task 9 - Create CloudFormation template generation Lambda
    // TODO: Task 10 - Create app settings Lambda functions
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
}
