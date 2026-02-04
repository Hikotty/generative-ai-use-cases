# Admin Dashboard E2E Tests

This directory contains end-to-end tests for the admin dashboard functionality using Playwright.

## Prerequisites

1. **Node.js**: Ensure you have Node.js 18+ installed
2. **Playwright**: Install Playwright browsers by running:
   ```bash
   npx playwright install
   ```

## Environment Variables

Before running the tests, set the following environment variables:

```bash
# Base URL of the application (default: http://localhost:5173)
export PLAYWRIGHT_BASE_URL=http://localhost:5173

# Admin user credentials for authentication
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=YourAdminPassword123!

# Regular user credentials for access control tests
export USER_EMAIL=user@example.com
export USER_PASSWORD=YourUserPassword123!
```

You can also create a `.env` file in the `packages/web` directory with these variables.

## Running Tests

### Start the Application

First, ensure the application is running:

```bash
# From the packages/web directory
npm run dev
```

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Tests with UI Mode

```bash
npm run test:e2e:ui
```

### Run Tests in Headed Mode (visible browser)

```bash
npm run test:e2e:headed
```

### Run Tests in Debug Mode

```bash
npm run test:e2e:debug
```

### View Test Report

After running tests, view the HTML report:

```bash
npm run test:e2e:report
```

## Test Structure

```
e2e/
├── admin/
│   ├── admin.spec.ts          # Main E2E test file
│   └── pages/                 # Page Object files
│       ├── index.ts           # Page objects export
│       ├── LoginPage.ts       # Login page interactions
│       ├── AdminDashboardPage.ts
│       ├── UserManagementPage.ts
│       ├── LogViewerPage.ts
│       ├── RagDocumentsPage.ts
│       └── DeployParametersPage.ts
└── README.md                  # This file
```

## Test Scenarios

### Admin Login Flow

- Display login page
- Login as admin user
- Show error for invalid credentials

### Admin Dashboard Navigation

- Display admin dashboard
- Navigate to User Management page
- Navigate to Log Viewer page
- Navigate to Cost Monitoring page
- Navigate to Usage Statistics page
- Navigate to Deploy Parameters page
- Navigate to App Settings page

### User Management Flow

- Display user list
- Search users by email
- Open/close create user dialog
- Create a new user
- Grant/revoke admin role
- Delete a user
- Handle pagination

### Log Viewer Flow

- Display log viewer page
- Display usage logs tab
- Display audit logs tab
- Filter logs by date range
- Clear filters
- Handle pagination

### RAG Documents Flow

- Display RAG documents page
- Display sync status
- Search documents
- Open upload dialog
- Disable upload during sync

### CloudFormation Template Generation Flow

- Display deploy parameters page
- Display feature toggles
- Toggle feature flags
- Validate stack name
- Display history section

### Admin Logout Flow

- Logout successfully

### Access Control Tests

- Redirect non-admin users to forbidden page
- Display forbidden page for non-admin users
- Allow admin users to access admin pages

## Page Object Pattern

The tests use the Page Object pattern for maintainability:

- Each page has its own class with locators and methods
- Locators support both Japanese and English text for i18n
- Methods encapsulate common interactions

Example usage:

```typescript
import { LoginPage, AdminDashboardPage } from './pages';

test('should login and navigate to dashboard', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const dashboardPage = new AdminDashboardPage(page);

  await loginPage.goto();
  await loginPage.loginAsAdmin();
  await dashboardPage.goto();

  await expect(dashboardPage.pageTitle).toBeVisible();
});
```

## Notes

1. **Backend Required**: These tests require a running application with proper backend API. They do not use mock data.

2. **Test User Cleanup**: The tests create test users during execution. These may need to be cleaned up manually if tests fail.

3. **RAG Tests**: RAG document tests depend on the `ragEnabled` configuration. If RAG is disabled, these tests will be skipped.

4. **Template Generation**: The CloudFormation template generation test is commented out as it requires actual backend infrastructure and may take a long time.

5. **Parallel Execution**: Tests are configured to run sequentially (`fullyParallel: false`) to avoid conflicts with shared state.

## Troubleshooting

### Browser not installed

```bash
npx playwright install chromium
```

### Tests timing out

- Increase timeout in `playwright.config.ts`
- Check if the application is running
- Verify environment variables are set correctly

### Authentication failures

- Verify admin/user credentials
- Check if Cognito user pool is configured correctly
- Ensure the user has the correct `custom:role` attribute
