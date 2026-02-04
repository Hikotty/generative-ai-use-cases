/**
 * User Management Page Object
 *
 * Handles interactions with the user management page.
 *
 * Requirements:
 * - 3.1: Display user list with email, role, status, created date
 * - 3.2: Show 50 users per page
 * - 3.3: Search users by email
 * - 3.5: Create new user with email address
 * - 3.6: Set admin role when creating user
 * - 3.7: Disable user account
 * - 3.9: Delete user (with confirmation dialog)
 */

import { Page, Locator, expect } from '@playwright/test';

export class UserManagementPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly searchInput: Locator;
  readonly createUserButton: Locator;
  readonly exportCsvButton: Locator;
  readonly downloadTemplateButton: Locator;
  readonly bulkImportButton: Locator;
  readonly userTable: Locator;
  readonly userRows: Locator;
  readonly paginationPrevious: Locator;
  readonly paginationNext: Locator;
  readonly loadingSpinner: Locator;
  readonly noUsersMessage: Locator;

  // Create User Dialog
  readonly createDialog: Locator;
  readonly emailInput: Locator;
  readonly adminToggle: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly dialogCloseButton: Locator;

  // Delete Confirmation Dialog
  readonly deleteDialog: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1');
    this.searchInput = page.locator(
      'input[placeholder*="検索"], input[placeholder*="Search"]'
    );
    this.createUserButton = page.locator(
      'button:has-text("ユーザー作成"), button:has-text("Create User")'
    );
    this.exportCsvButton = page.locator(
      'button:has-text("CSVエクスポート"), button:has-text("Export CSV")'
    );
    this.downloadTemplateButton = page.locator(
      'button:has-text("テンプレート"), button:has-text("Template")'
    );
    this.bulkImportButton = page.locator(
      'button:has-text("一括登録"), button:has-text("Bulk Import")'
    );
    this.userTable = page.locator('table');
    this.userRows = page.locator('table tbody tr');
    this.paginationPrevious = page.locator(
      'button:has-text("前へ"), button:has-text("Previous")'
    );
    this.paginationNext = page.locator(
      'button:has-text("次へ"), button:has-text("Next")'
    );
    this.loadingSpinner = page.locator('.animate-spin');
    this.noUsersMessage = page.locator(
      'text=ユーザーが見つかりません, text=No users found'
    );

    // Create User Dialog
    this.createDialog = page.locator('[role="dialog"]');
    this.emailInput = page.locator(
      '[role="dialog"] input[type="email"], [role="dialog"] input[id="email"]'
    );
    this.adminToggle = page.locator(
      '[role="dialog"] [role="switch"], [role="dialog"] button[role="switch"]'
    );
    this.createSubmitButton = page.locator(
      '[role="dialog"] button:has-text("作成"), [role="dialog"] button:has-text("Create")'
    );
    this.createCancelButton = page.locator(
      '[role="dialog"] button:has-text("キャンセル"), [role="dialog"] button:has-text("Cancel")'
    );
    this.dialogCloseButton = page
      .locator('[role="dialog"] button:has(svg)')
      .first();

    // Delete Confirmation Dialog
    this.deleteDialog = page.locator(
      '[role="dialog"]:has-text("削除"), [role="dialog"]:has-text("Delete")'
    );
    this.deleteConfirmButton = page
      .locator(
        '[role="dialog"] button[color="red"], [role="dialog"] button:has-text("削除する"), [role="dialog"] button:has-text("Delete")'
      )
      .last();
    this.deleteCancelButton = page.locator(
      '[role="dialog"] button:has-text("キャンセル"), [role="dialog"] button:has-text("Cancel")'
    );
  }

  /**
   * Navigate to user management page
   */
  async goto(): Promise<void> {
    await this.page.goto('/admin/users');
    await this.waitForPageLoad();
  }

  /**
   * Wait for page to fully load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    await expect(this.pageTitle).toBeVisible({ timeout: 10000 });
  }

  /**
   * Wait for user list to load
   */
  async waitForUserList(): Promise<void> {
    // Wait for either the table or the no users message
    await Promise.race([
      this.userTable.waitFor({ state: 'visible', timeout: 10000 }),
      this.noUsersMessage.waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Search for users by email
   * @param query - Search query
   */
  async searchUsers(query: string): Promise<void> {
    await this.searchInput.fill(query);
    // Wait for debounce and API call
    await this.page.waitForTimeout(500);
    await this.waitForUserList();
  }

  /**
   * Clear search input
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
    await this.page.waitForTimeout(500);
    await this.waitForUserList();
  }

  /**
   * Open create user dialog
   */
  async openCreateUserDialog(): Promise<void> {
    await this.createUserButton.click();
    await expect(this.createDialog).toBeVisible({ timeout: 5000 });
  }

  /**
   * Create a new user
   * @param email - User email address
   * @param isAdmin - Whether to grant admin role
   */
  async createUser(email: string, isAdmin: boolean = false): Promise<void> {
    await this.openCreateUserDialog();
    await this.emailInput.fill(email);

    if (isAdmin) {
      await this.adminToggle.click();
    }

    await this.createSubmitButton.click();

    // Wait for dialog to close
    await expect(this.createDialog).not.toBeVisible({ timeout: 10000 });
  }

  /**
   * Close create user dialog
   */
  async closeCreateUserDialog(): Promise<void> {
    await this.createCancelButton.click();
    await expect(this.createDialog).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Get user row by email
   * @param email - User email to find
   */
  getUserRowByEmail(email: string): Locator {
    return this.page.locator(`table tbody tr:has-text("${email}")`);
  }

  /**
   * Grant admin role to a user
   * @param email - User email
   */
  async grantAdminRole(email: string): Promise<void> {
    const row = this.getUserRowByEmail(email);
    const grantButton = row.locator(
      'button:has-text("管理者付与"), button:has-text("Grant Admin")'
    );
    await grantButton.click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Revoke admin role from a user
   * @param email - User email
   */
  async revokeAdminRole(email: string): Promise<void> {
    const row = this.getUserRowByEmail(email);
    const revokeButton = row.locator(
      'button:has-text("管理者剥奪"), button:has-text("Revoke Admin")'
    );
    await revokeButton.click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Disable a user account
   * @param email - User email
   */
  async disableUser(email: string): Promise<void> {
    const row = this.getUserRowByEmail(email);
    const disableButton = row.locator(
      'button:has-text("無効化"), button:has-text("Disable")'
    );
    await disableButton.click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Enable a user account
   * @param email - User email
   */
  async enableUser(email: string): Promise<void> {
    const row = this.getUserRowByEmail(email);
    const enableButton = row.locator(
      'button:has-text("有効化"), button:has-text("Enable")'
    );
    await enableButton.click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Delete a user
   * @param email - User email
   */
  async deleteUser(email: string): Promise<void> {
    const row = this.getUserRowByEmail(email);
    const deleteButton = row.locator(
      'button:has-text("削除"), button:has-text("Delete")'
    );
    await deleteButton.click();

    // Wait for confirmation dialog
    await expect(this.deleteDialog).toBeVisible({ timeout: 5000 });

    // Confirm deletion
    await this.deleteConfirmButton.click();

    // Wait for dialog to close
    await expect(this.deleteDialog).not.toBeVisible({ timeout: 10000 });
  }

  /**
   * Cancel user deletion
   */
  async cancelDeleteUser(): Promise<void> {
    await this.deleteCancelButton.click();
    await expect(this.deleteDialog).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Get the number of users displayed
   */
  async getUserCount(): Promise<number> {
    return await this.userRows.count();
  }

  /**
   * Check if a user exists in the list
   * @param email - User email to check
   */
  async userExists(email: string): Promise<boolean> {
    const row = this.getUserRowByEmail(email);
    return await row.isVisible();
  }

  /**
   * Check if user has admin badge
   * @param email - User email
   */
  async isUserAdmin(email: string): Promise<boolean> {
    const row = this.getUserRowByEmail(email);
    const adminBadge = row.locator(
      'span:has-text("管理者"), span:has-text("Admin")'
    );
    return await adminBadge.isVisible();
  }

  /**
   * Navigate to next page
   */
  async nextPage(): Promise<void> {
    await this.paginationNext.click();
    await this.waitForUserList();
  }

  /**
   * Navigate to previous page
   */
  async previousPage(): Promise<void> {
    await this.paginationPrevious.click();
    await this.waitForUserList();
  }

  /**
   * Check if next page button is enabled
   */
  async hasNextPage(): Promise<boolean> {
    return await this.paginationNext.isEnabled();
  }

  /**
   * Check if previous page button is enabled
   */
  async hasPreviousPage(): Promise<boolean> {
    return await this.paginationPrevious.isEnabled();
  }

  /**
   * Export users to CSV
   */
  async exportCsv(): Promise<void> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportCsvButton.click();
    await downloadPromise;
  }

  /**
   * Download CSV template
   */
  async downloadTemplate(): Promise<void> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.downloadTemplateButton.click();
    await downloadPromise;
  }
}
