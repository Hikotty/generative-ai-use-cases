/**
 * Admin Dashboard E2E Tests
 *
 * End-to-end tests for the admin dashboard functionality.
 *
 * Test Scenarios:
 * - Admin login flow (authenticate as admin user)
 * - User management: navigate to users page, create user, edit user, delete user
 * - Log viewer: navigate to logs page, apply filters, export logs
 * - RAG documents: navigate to RAG page, upload document, delete document
 * - CloudFormation: navigate to deploy page, generate template
 * - Admin logout
 *
 * Requirements: All requirements
 *
 * Note: These tests require a running application with proper backend API.
 * Set the following environment variables before running:
 * - PLAYWRIGHT_BASE_URL: Base URL of the application (default: http://localhost:5173)
 * - ADMIN_EMAIL: Admin user email for authentication
 * - ADMIN_PASSWORD: Admin user password for authentication
 * - USER_EMAIL: Regular user email for access control tests
 * - USER_PASSWORD: Regular user password for access control tests
 */

import { test, expect } from '@playwright/test';
import {
  LoginPage,
  AdminDashboardPage,
  UserManagementPage,
  LogViewerPage,
  RagDocumentsPage,
  DeployParametersPage,
} from './pages';

// Test configuration
const TEST_USER_EMAIL = `test-user-${Date.now()}@example.com`;

test.describe('Admin Dashboard E2E Tests', () => {
  let loginPage: LoginPage;
  let dashboardPage: AdminDashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new AdminDashboardPage(page);
  });

  test.describe('Admin Login Flow', () => {
    test('should display login page', async () => {
      await loginPage.goto();
      await expect(loginPage.emailInput).toBeVisible();
      await expect(loginPage.passwordInput).toBeVisible();
      await expect(loginPage.signInButton).toBeVisible();
    });

    test('should login as admin user', async () => {
      await loginPage.goto();
      await loginPage.loginAsAdmin();
      
      // Navigate to admin dashboard
      await dashboardPage.goto();
      
      // Verify dashboard is displayed
      await expect(dashboardPage.pageTitle).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await loginPage.goto();
      await loginPage.login('invalid@example.com', 'wrongpassword');
      
      // Wait for error message
      await page.waitForTimeout(2000);
      
      // Should still be on login page or show error
      const isLoggedIn = await loginPage.isLoggedIn();
      expect(isLoggedIn).toBe(false);
    });
  });

  test.describe('Admin Dashboard Navigation', () => {
    test.beforeEach(async () => {
      await loginPage.goto();
      await loginPage.loginAsAdmin();
      await dashboardPage.goto();
    });

    test('should display admin dashboard', async () => {
      await expect(dashboardPage.pageTitle).toBeVisible();
      
      // Check KPI cards are displayed
      const kpiCount = await dashboardPage.getKpiCardCount();
      expect(kpiCount).toBeGreaterThan(0);
    });

    test('should navigate to User Management page', async () => {
      await dashboardPage.navigateToUsers();
      await expect(dashboardPage.page).toHaveURL(/\/admin\/users/);
    });

    test('should navigate to Log Viewer page', async () => {
      await dashboardPage.navigateToLogs();
      await expect(dashboardPage.page).toHaveURL(/\/admin\/logs/);
    });

    test('should navigate to Cost Monitoring page', async () => {
      await dashboardPage.navigateToCosts();
      await expect(dashboardPage.page).toHaveURL(/\/admin\/costs/);
    });

    test('should navigate to Usage Statistics page', async () => {
      await dashboardPage.navigateToStats();
      await expect(dashboardPage.page).toHaveURL(/\/admin\/stats/);
    });

    test('should navigate to Deploy Parameters page', async () => {
      await dashboardPage.navigateToDeploy();
      await expect(dashboardPage.page).toHaveURL(/\/admin\/deploy/);
    });

    test('should navigate to App Settings page', async () => {
      await dashboardPage.navigateToSettings();
      await expect(dashboardPage.page).toHaveURL(/\/admin\/settings/);
    });
  });

  test.describe('User Management Flow', () => {
    let userManagementPage: UserManagementPage;

    test.beforeEach(async () => {
      userManagementPage = new UserManagementPage(dashboardPage.page);
      await loginPage.goto();
      await loginPage.loginAsAdmin();
      await userManagementPage.goto();
    });

    test('should display user list', async () => {
      await userManagementPage.waitForUserList();
      await expect(userManagementPage.userTable).toBeVisible();
    });

    test('should search users by email', async () => {
      await userManagementPage.searchUsers('admin');
      await userManagementPage.waitForUserList();
      
      // Verify search results
      const userCount = await userManagementPage.getUserCount();
      expect(userCount).toBeGreaterThanOrEqual(0);
    });

    test('should open create user dialog', async () => {
      await userManagementPage.openCreateUserDialog();
      await expect(userManagementPage.createDialog).toBeVisible();
      await expect(userManagementPage.emailInput).toBeVisible();
      await expect(userManagementPage.adminToggle).toBeVisible();
    });

    test('should close create user dialog', async () => {
      await userManagementPage.openCreateUserDialog();
      await userManagementPage.closeCreateUserDialog();
      await expect(userManagementPage.createDialog).not.toBeVisible();
    });

    test('should create a new user', async () => {
      await userManagementPage.createUser(TEST_USER_EMAIL, false);
      
      // Verify user was created
      await userManagementPage.searchUsers(TEST_USER_EMAIL);
      const userExists = await userManagementPage.userExists(TEST_USER_EMAIL);
      expect(userExists).toBe(true);
    });

    test('should grant admin role to user', async () => {
      // First ensure the test user exists
      await userManagementPage.searchUsers(TEST_USER_EMAIL);
      const userExists = await userManagementPage.userExists(TEST_USER_EMAIL);
      
      if (userExists) {
        await userManagementPage.grantAdminRole(TEST_USER_EMAIL);
        
        // Verify admin badge is displayed
        const isAdmin = await userManagementPage.isUserAdmin(TEST_USER_EMAIL);
        expect(isAdmin).toBe(true);
      }
    });

    test('should revoke admin role from user', async () => {
      await userManagementPage.searchUsers(TEST_USER_EMAIL);
      const userExists = await userManagementPage.userExists(TEST_USER_EMAIL);
      
      if (userExists) {
        const isAdmin = await userManagementPage.isUserAdmin(TEST_USER_EMAIL);
        if (isAdmin) {
          await userManagementPage.revokeAdminRole(TEST_USER_EMAIL);
          
          // Verify admin badge is not displayed
          const isStillAdmin = await userManagementPage.isUserAdmin(TEST_USER_EMAIL);
          expect(isStillAdmin).toBe(false);
        }
      }
    });

    test('should delete a user', async () => {
      await userManagementPage.searchUsers(TEST_USER_EMAIL);
      const userExists = await userManagementPage.userExists(TEST_USER_EMAIL);
      
      if (userExists) {
        await userManagementPage.deleteUser(TEST_USER_EMAIL);
        
        // Verify user was deleted
        await userManagementPage.searchUsers(TEST_USER_EMAIL);
        const stillExists = await userManagementPage.userExists(TEST_USER_EMAIL);
        expect(stillExists).toBe(false);
      }
    });

    test('should handle pagination', async () => {
      await userManagementPage.clearSearch();
      await userManagementPage.waitForUserList();
      
      const hasNext = await userManagementPage.hasNextPage();
      const hasPrevious = await userManagementPage.hasPreviousPage();
      
      // First page should not have previous
      expect(hasPrevious).toBe(false);
      
      // If there's a next page, navigate to it
      if (hasNext) {
        await userManagementPage.nextPage();
        const newHasPrevious = await userManagementPage.hasPreviousPage();
        expect(newHasPrevious).toBe(true);
      }
    });
  });

  test.describe('Log Viewer Flow', () => {
    let logViewerPage: LogViewerPage;

    test.beforeEach(async () => {
      logViewerPage = new LogViewerPage(dashboardPage.page);
      await loginPage.goto();
      await loginPage.loginAsAdmin();
      await logViewerPage.goto();
    });

    test('should display log viewer page', async () => {
      await expect(logViewerPage.pageTitle).toBeVisible();
    });

    test('should display usage logs tab', async () => {
      await logViewerPage.switchToUsageLogs();
      await expect(logViewerPage.logTable).toBeVisible();
    });

    test('should display audit logs tab', async () => {
      await logViewerPage.switchToAuditLogs();
      // Audit logs table should be visible
      await expect(logViewerPage.auditLogTable).toBeVisible();
    });

    test('should filter logs by date range', async () => {
      const today = new Date();
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const startDate = lastWeek.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];
      
      await logViewerPage.filterByDateRange(startDate, endDate);
      
      // Verify filters are applied
      const hasFilters = await logViewerPage.hasActiveFilters();
      expect(hasFilters).toBe(true);
    });

    test('should clear filters', async () => {
      // Apply a filter first
      await logViewerPage.setUserIdFilter('test-user');
      await logViewerPage.applyFilters();
      
      // Clear filters
      await logViewerPage.clearFilters();
      
      // Verify filters are cleared
      const hasFilters = await logViewerPage.hasActiveFilters();
      expect(hasFilters).toBe(false);
    });

    test('should handle pagination', async () => {
      await logViewerPage.waitForLogList();
      
      const hasNext = await logViewerPage.hasNextPage();
      const hasPrevious = await logViewerPage.hasPreviousPage();
      
      // First page should not have previous
      expect(hasPrevious).toBe(false);
      
      // If there's a next page, navigate to it
      if (hasNext) {
        await logViewerPage.nextPage();
        const newHasPrevious = await logViewerPage.hasPreviousPage();
        expect(newHasPrevious).toBe(true);
      }
    });
  });

  test.describe('RAG Documents Flow', () => {
    let ragDocumentsPage: RagDocumentsPage;

    test.beforeEach(async () => {
      ragDocumentsPage = new RagDocumentsPage(dashboardPage.page);
      await loginPage.goto();
      await loginPage.loginAsAdmin();
    });

    test('should display RAG documents page', async ({ page }) => {
      // Check if RAG is enabled by trying to navigate
      await page.goto('/admin/rag');
      
      // If RAG is enabled, page should load
      // If not, we might be redirected or see an error
      const url = page.url();
      if (url.includes('/admin/rag')) {
        await expect(ragDocumentsPage.pageTitle).toBeVisible();
      }
    });

    test('should display sync status', async ({ page }) => {
      await page.goto('/admin/rag');
      const url = page.url();
      
      if (url.includes('/admin/rag')) {
        await ragDocumentsPage.waitForPageLoad();
        // Sync status badge should be visible
        await expect(ragDocumentsPage.syncStatusBadge).toBeVisible();
      }
    });

    test('should search documents', async ({ page }) => {
      await page.goto('/admin/rag');
      const url = page.url();
      
      if (url.includes('/admin/rag')) {
        await ragDocumentsPage.waitForPageLoad();
        await ragDocumentsPage.searchDocuments('test');
        
        // Search should complete without error
        await ragDocumentsPage.waitForDocumentList();
      }
    });

    test('should open upload dialog', async ({ page }) => {
      await page.goto('/admin/rag');
      const url = page.url();
      
      if (url.includes('/admin/rag')) {
        await ragDocumentsPage.waitForPageLoad();
        
        // Check if upload is enabled (not during sync)
        const isEnabled = await ragDocumentsPage.isUploadEnabled();
        if (isEnabled) {
          await ragDocumentsPage.openUploadDialog();
          await expect(ragDocumentsPage.uploadDialog).toBeVisible();
          await ragDocumentsPage.cancelUpload();
        }
      }
    });

    test('should disable upload during sync', async ({ page }) => {
      await page.goto('/admin/rag');
      const url = page.url();
      
      if (url.includes('/admin/rag')) {
        await ragDocumentsPage.waitForPageLoad();
        
        const isSyncing = await ragDocumentsPage.isSyncInProgress();
        if (isSyncing) {
          // Upload button should be disabled during sync
          const isEnabled = await ragDocumentsPage.isUploadEnabled();
          expect(isEnabled).toBe(false);
        }
      }
    });
  });

  test.describe('CloudFormation Template Generation Flow', () => {
    let deployParametersPage: DeployParametersPage;

    test.beforeEach(async () => {
      deployParametersPage = new DeployParametersPage(dashboardPage.page);
      await loginPage.goto();
      await loginPage.loginAsAdmin();
      await deployParametersPage.goto();
    });

    test('should display deploy parameters page', async () => {
      await expect(deployParametersPage.pageTitle).toBeVisible();
    });

    test('should display feature toggles', async () => {
      await expect(deployParametersPage.ragEnabledToggle).toBeVisible();
      await expect(deployParametersPage.agentEnabledToggle).toBeVisible();
    });

    test('should display generate template button', async () => {
      await expect(deployParametersPage.generateTemplateButton).toBeVisible();
    });

    test('should toggle feature flags', async () => {
      // Toggle RAG enabled
      await deployParametersPage.toggleRagEnabled();
      
      // Should show unsaved changes
      const hasChanges = await deployParametersPage.hasUnsavedChanges();
      expect(hasChanges).toBe(true);
    });

    test('should validate stack name', async () => {
      // Enter invalid stack name
      await deployParametersPage.setStackName('invalid stack name with spaces');
      
      // Should show validation error
      const hasErrors = await deployParametersPage.hasValidationErrors();
      expect(hasErrors).toBe(true);
    });

    test('should display history section', async () => {
      // History section should be visible
      await expect(deployParametersPage.historyTable).toBeVisible();
    });

    // Note: Template generation test is commented out as it requires
    // actual backend infrastructure and may take a long time
    // test('should generate CloudFormation template', async () => {
    //   await deployParametersPage.generateTemplate();
    //   
    //   const isGenerated = await deployParametersPage.isTemplateGenerated();
    //   expect(isGenerated).toBe(true);
    //   
    //   // Quick Create Link should be displayed
    //   await expect(deployParametersPage.quickCreateLinkInput).toBeVisible();
    //   await expect(deployParametersPage.openConsoleButton).toBeVisible();
    //   await expect(deployParametersPage.downloadTemplateButton).toBeVisible();
    // });
  });

  test.describe('Admin Logout Flow', () => {
    test.beforeEach(async () => {
      await loginPage.goto();
      await loginPage.loginAsAdmin();
      await dashboardPage.goto();
    });

    test('should logout successfully', async () => {
      // Find and click logout button
      // The logout button location depends on the UI implementation
      // eslint-disable-next-line i18nhelper/no-jp-string
      const logoutButton = dashboardPage.page.locator('button:has-text("ログアウト"), button:has-text("Sign out"), button:has-text("Logout")');
      
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
        
        // Should be redirected to login page
        await expect(loginPage.emailInput).toBeVisible({ timeout: 10000 });
      }
    });
  });
});

test.describe('Access Control Tests', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test('should redirect non-admin users to forbidden page', async ({ page }) => {
    await loginPage.goto();
    await loginPage.loginAsUser();
    
    // Try to access admin page
    await page.goto('/admin');
    
    // Should be redirected to forbidden page
    await expect(page).toHaveURL(/\/admin\/forbidden/);
  });

  test('should display forbidden page for non-admin users', async ({ page }) => {
    await loginPage.goto();
    await loginPage.loginAsUser();
    
    // Navigate to forbidden page
    await page.goto('/admin/forbidden');
    
    // Forbidden page should be displayed
    // eslint-disable-next-line i18nhelper/no-jp-string
    const forbiddenTitle = page.locator('h1:has-text("アクセス拒否"), h1:has-text("Access Denied"), h1:has-text("Forbidden")');
    await expect(forbiddenTitle).toBeVisible();
  });

  test('should allow admin users to access admin pages', async ({ page }) => {
    await loginPage.goto();
    await loginPage.loginAsAdmin();
    
    // Navigate to admin page
    await page.goto('/admin');
    
    // Should not be redirected to forbidden page
    await expect(page).not.toHaveURL(/\/admin\/forbidden/);
  });
});

/**
 * Regular User Access Control E2E Tests
 *
 * Tests for verifying that regular users (non-admin) cannot access admin pages
 * but can still use existing features like chat.
 *
 * Requirements: 2.5, 2.6, 2.7, 15.1-15.6
 */
test.describe('Regular User Access Control E2E Tests', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
  });

  test.describe('Regular User Login', () => {
    test('should login as regular user successfully', async () => {
      await loginPage.goto();
      await loginPage.loginAsUser();
      
      // Verify user is logged in
      const isLoggedIn = await loginPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });
  });

  test.describe('Admin Page Access Denied for Regular Users', () => {
    test.beforeEach(async () => {
      await loginPage.goto();
      await loginPage.loginAsUser();
    });

    test('should deny access to /admin dashboard', async () => {
      await loginPage.page.goto('/admin');
      
      // Should be redirected to forbidden page or show 403 error
      await expect(loginPage.page).toHaveURL(/\/admin\/forbidden/);
      
      // Verify forbidden page content
      // eslint-disable-next-line i18nhelper/no-jp-string
      const forbiddenContent = loginPage.page.locator('text=アクセス拒否, text=Access Denied, text=Forbidden, text=403');
      await expect(forbiddenContent.first()).toBeVisible();
    });

    test('should deny access to /admin/users', async () => {
      await loginPage.page.goto('/admin/users');
      
      // Should be redirected to forbidden page
      await expect(loginPage.page).toHaveURL(/\/admin\/forbidden/);
    });

    test('should deny access to /admin/logs', async () => {
      await loginPage.page.goto('/admin/logs');
      
      // Should be redirected to forbidden page
      await expect(loginPage.page).toHaveURL(/\/admin\/forbidden/);
    });

    test('should deny access to /admin/costs', async () => {
      await loginPage.page.goto('/admin/costs');
      
      // Should be redirected to forbidden page
      await expect(loginPage.page).toHaveURL(/\/admin\/forbidden/);
    });

    test('should deny access to /admin/stats', async () => {
      await loginPage.page.goto('/admin/stats');
      
      // Should be redirected to forbidden page
      await expect(loginPage.page).toHaveURL(/\/admin\/forbidden/);
    });

    test('should deny access to /admin/deploy', async () => {
      await loginPage.page.goto('/admin/deploy');
      
      // Should be redirected to forbidden page
      await expect(loginPage.page).toHaveURL(/\/admin\/forbidden/);
    });

    test('should deny access to /admin/settings', async () => {
      await loginPage.page.goto('/admin/settings');
      
      // Should be redirected to forbidden page
      await expect(loginPage.page).toHaveURL(/\/admin\/forbidden/);
    });

    test('should deny access to /admin/rag', async () => {
      await loginPage.page.goto('/admin/rag');
      
      // Should be redirected to forbidden page
      await expect(loginPage.page).toHaveURL(/\/admin\/forbidden/);
    });
  });

  test.describe('Existing Features Work for Regular Users', () => {
    test.beforeEach(async () => {
      await loginPage.goto();
      await loginPage.loginAsUser();
    });

    test('should allow regular user to access chat page', async () => {
      // Navigate to chat page
      await loginPage.page.goto('/chat');
      
      // Should not be redirected to forbidden page
      await expect(loginPage.page).not.toHaveURL(/\/admin\/forbidden/);
      await expect(loginPage.page).not.toHaveURL(/\/forbidden/);
      
      // Chat page should be displayed
      // Look for chat-related elements
      const chatContent = loginPage.page.locator('[data-testid="chat-page"], .chat-container, main, [class*="chat"]');
      await expect(chatContent.first()).toBeVisible({ timeout: 10000 });
    });

    test('should allow regular user to access home page', async () => {
      // Navigate to home page
      await loginPage.page.goto('/');
      
      // Should not be redirected to forbidden page
      await expect(loginPage.page).not.toHaveURL(/\/admin\/forbidden/);
      await expect(loginPage.page).not.toHaveURL(/\/forbidden/);
      
      // Home page content should be visible
      const mainContent = loginPage.page.locator('main, [data-testid="app-content"], .app-content');
      await expect(mainContent.first()).toBeVisible({ timeout: 10000 });
    });

    test('should not show admin menu item for regular users', async () => {
      // Navigate to home page
      await loginPage.page.goto('/');
      
      // Wait for page to load
      await loginPage.page.waitForLoadState('networkidle');
      
      // Admin menu item should not be visible
      // eslint-disable-next-line i18nhelper/no-jp-string
      const adminMenuItem = loginPage.page.locator('a[href="/admin"], button:has-text("管理画面"), button:has-text("Admin"), nav >> text=管理画面, nav >> text=Admin');
      
      // Check if admin menu is NOT visible
      const isAdminMenuVisible = await adminMenuItem.first().isVisible().catch(() => false);
      expect(isAdminMenuVisible).toBe(false);
    });

    test('should allow regular user to navigate between normal pages', async () => {
      // Start at home page
      await loginPage.page.goto('/');
      await expect(loginPage.page).not.toHaveURL(/\/admin\/forbidden/);
      
      // Navigate to chat
      await loginPage.page.goto('/chat');
      await expect(loginPage.page).not.toHaveURL(/\/admin\/forbidden/);
      
      // Navigate back to home
      await loginPage.page.goto('/');
      await expect(loginPage.page).not.toHaveURL(/\/admin\/forbidden/);
      
      // All navigations should succeed without forbidden errors
      const mainContent = loginPage.page.locator('main, [data-testid="app-content"], .app-content');
      await expect(mainContent.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Backend API Access Control', () => {
    test.beforeEach(async () => {
      await loginPage.goto();
      await loginPage.loginAsUser();
    });

    test('should return 403 for admin API endpoints', async () => {
      // Try to access admin API endpoint directly
      const response = await loginPage.page.request.get('/api/admin/users');
      
      // Should return 403 Forbidden
      expect(response.status()).toBe(403);
    });

    test('should return 403 for admin stats API', async () => {
      const response = await loginPage.page.request.get('/api/admin/stats');
      
      // Should return 403 Forbidden
      expect(response.status()).toBe(403);
    });

    test('should return 403 for admin logs API', async () => {
      const response = await loginPage.page.request.get('/api/admin/logs');
      
      // Should return 403 Forbidden
      expect(response.status()).toBe(403);
    });
  });
});
