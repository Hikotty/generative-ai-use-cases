/**
 * Login Page Object
 *
 * Handles authentication flows for E2E tests.
 * Uses AWS Amplify/Cognito authentication.
 */

import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly signOutButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    // AWS Amplify UI components
    this.emailInput = page.locator('input[name="username"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.signInButton = page.locator('button[type="submit"]');
    this.signOutButton = page.locator(
      'button:has-text("Sign out"), button:has-text("ログアウト")'
    );
    this.errorMessage = page.locator('[data-amplify-error]');
  }

  /**
   * Navigate to the login page
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /**
   * Login with email and password
   * @param email - User email address
   * @param password - User password
   */
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();

    // Wait for navigation after successful login
    await this.page.waitForURL((url) => !url.pathname.includes('login'), {
      timeout: 30000,
    });
  }

  /**
   * Login as admin user
   * Uses environment variables for credentials
   */
  async loginAsAdmin(): Promise<void> {
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
    await this.login(email, password);
  }

  /**
   * Login as regular user (non-admin)
   * Uses environment variables for credentials
   */
  async loginAsUser(): Promise<void> {
    const email = process.env.USER_EMAIL || 'user@example.com';
    const password = process.env.USER_PASSWORD || 'UserPassword123!';
    await this.login(email, password);
  }

  /**
   * Logout from the application
   */
  async logout(): Promise<void> {
    // Click on user menu or settings to find logout button
    await this.signOutButton.click();

    // Wait for redirect to login page
    await expect(this.emailInput).toBeVisible({ timeout: 10000 });
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      // Check if we're on a page that requires authentication
      await this.page.waitForSelector(
        '[data-testid="app-content"], .app-content, main',
        {
          timeout: 5000,
        }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if login error is displayed
   */
  async hasError(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Get error message text
   */
  async getErrorMessage(): Promise<string> {
    return (await this.errorMessage.textContent()) || '';
  }
}
