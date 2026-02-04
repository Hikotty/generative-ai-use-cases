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
import * as https from 'https';

/**
 * Send response to CloudFormation
 */
async function sendResponse(
  event: CloudFormationCustomResourceEvent,
  status: 'SUCCESS' | 'FAILED',
  physicalResourceId: string,
  data?: Record<string, string>,
  reason?: string
): Promise<void> {
  const responseBody = JSON.stringify({
    Status: status,
    Reason: reason || `See CloudWatch Log Stream`,
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  });

  console.log('Response body:', responseBody);

  const parsedUrl = new URL(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'PUT',
    headers: {
      'Content-Type': '',
      'Content-Length': Buffer.byteLength(responseBody),
    },
  };

  console.log('Sending request to:', parsedUrl.hostname, options.path);

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      console.log(`Response status code: ${response.statusCode}`);
      resolve();
    });

    request.on('error', (error) => {
      console.error('sendResponse Error:', error);
      reject(error);
    });

    request.write(responseBody);
    request.end();
  });
}

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
  
  // For Delete/Update, use existing PhysicalResourceId or fallback to email
  const physicalResourceId = event.RequestType === 'Create' 
    ? email 
    : (event.PhysicalResourceId || email || 'unknown');

  try {
    // Validate required properties for Create
    if (event.RequestType === 'Create') {
      if (!userPoolId) {
        throw new Error('UserPoolId is required');
      }
      if (!email) {
        throw new Error('Email is required');
      }
    }

    const client = new CognitoIdentityProviderClient({});

    switch (event.RequestType) {
      case 'Create':
        await handleCreate(client, userPoolId, email);
        console.log('Sending SUCCESS response for Create');
        await sendResponse(event, 'SUCCESS', email, {
          Email: email,
          Message: 'Admin user created successfully',
        });
        console.log('SUCCESS response sent for Create');
        break;

      case 'Update':
        // On update, we don't modify the user
        console.log('Update request - no action taken');
        console.log('Sending SUCCESS response for Update');
        await sendResponse(event, 'SUCCESS', physicalResourceId, {
          Message: 'No action taken on update',
        });
        console.log('SUCCESS response sent for Update');
        break;

      case 'Delete':
        // On delete, we don't remove the user to preserve data
        console.log('Delete request - user preserved');
        console.log('Sending SUCCESS response for Delete with physicalResourceId:', physicalResourceId);
        await sendResponse(event, 'SUCCESS', physicalResourceId, {
          Message: 'User preserved on delete',
        });
        console.log('SUCCESS response sent for Delete');
        break;
    }
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log('Sending FAILED response');
    await sendResponse(
      event,
      'FAILED',
      physicalResourceId,
      undefined,
      errorMessage
    );
    console.log('FAILED response sent');
  }

  return {
    Status: 'SUCCESS',
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
  };
};

/**
 * Handle Create request - creates the initial admin user.
 *
 * @param client - Cognito Identity Provider client
 * @param userPoolId - Cognito User Pool ID
 * @param email - Email address for the admin user
 */
async function handleCreate(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string
): Promise<void> {
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
  } catch (error) {
    // Requirement 1.5.7: Handle UsernameExistsException for idempotency
    if (error instanceof UsernameExistsException) {
      console.log(`User already exists: ${email} - skipping creation`);
      return;
    }

    // Re-throw other errors
    console.error('Error creating admin user:', error);
    throw error;
  }
}
