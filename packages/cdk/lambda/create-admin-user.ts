/**
 * CDK Custom Resource Lambda function for creating the initial admin user.
 *
 * This Lambda function is invoked by CloudFormation during stack deployment
 * to create the initial admin user in Cognito User Pool.
 *
 * Requirements:
 * - 1.5.3: Use AdminCreateUser API to create user
 * - 1.5.4: Set custom:role attribute to 'admin'
 * - 1.5.5: Set email_verified attribute to 'true'
 * - 1.5.6: Generate random temporary password and send via email
 * - 1.5.7: Handle UsernameExistsException for idempotency
 */

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from 'aws-lambda';

/**
 * Custom Resource event handler for creating initial admin user.
 *
 * CloudFormation lifecycle:
 * - Create: Creates the admin user in Cognito
 * - Update: No action (returns existing PhysicalResourceId)
 * - Delete: No action (user is not deleted to preserve data)
 *
 * @param event - CloudFormation Custom Resource event
 * @returns CloudFormation Custom Resource response
 */
export const onEvent = async (
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const userPoolId = event.ResourceProperties.UserPoolId;
  const email = event.ResourceProperties.Email;

  // Validate required properties
  if (!userPoolId) {
    throw new Error('UserPoolId is required');
  }
  if (!email) {
    throw new Error('Email is required');
  }

  const client = new CognitoIdentityProviderClient({});

  switch (event.RequestType) {
    case 'Create':
      return await handleCreate(client, userPoolId, email, event);

    case 'Update':
      // On update, we don't modify the user
      // Return the existing PhysicalResourceId
      console.log('Update request - no action taken');
      return {
        Status: 'SUCCESS',
        PhysicalResourceId: event.PhysicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
      };

    case 'Delete':
      // On delete, we don't remove the user to preserve data
      // The user can be manually deleted if needed
      console.log('Delete request - user preserved');
      return {
        Status: 'SUCCESS',
        PhysicalResourceId: event.PhysicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
      };
  }
};

/**
 * Handle Create request - creates the initial admin user.
 *
 * @param client - Cognito Identity Provider client
 * @param userPoolId - Cognito User Pool ID
 * @param email - Email address for the admin user
 * @param event - CloudFormation Custom Resource event
 * @returns CloudFormation Custom Resource response
 */
async function handleCreate(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> {
  try {
    console.log(`Creating admin user with email: ${email}`);

    // Create admin user with AdminCreateUser API
    // Requirements: 1.5.3, 1.5.4, 1.5.5, 1.5.6
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          // Set email attribute
          { Name: 'email', Value: email },
          // Requirement 1.5.5: Set email_verified to true
          { Name: 'email_verified', Value: 'true' },
          // Requirement 1.5.4: Set custom:role to 'admin'
          { Name: 'custom:role', Value: 'admin' },
        ],
        // Requirement 1.5.6: Send temporary password via email
        DesiredDeliveryMediums: ['EMAIL'],
        // Force password change on first login (Requirement 1.5.8)
        // This is the default behavior of AdminCreateUser
      })
    );

    console.log(`Successfully created admin user: ${email}`);

    return {
      Status: 'SUCCESS',
      PhysicalResourceId: email,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: {
        Email: email,
        Message: 'Admin user created successfully',
      },
    };
  } catch (error) {
    // Requirement 1.5.7: Handle UsernameExistsException for idempotency
    if (error instanceof UsernameExistsException) {
      console.log(`User already exists: ${email} - skipping creation`);

      return {
        Status: 'SUCCESS',
        PhysicalResourceId: email,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: {
          Email: email,
          Message: 'Admin user already exists - skipped creation',
        },
      };
    }

    // Re-throw other errors
    console.error('Error creating admin user:', error);
    throw error;
  }
}
