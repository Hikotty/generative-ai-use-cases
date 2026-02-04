/**
 * Log Viewer Page Object
 *
 * Handles interactions with the log viewer page.
 *
 * Requirements:
 * - 4.1: Display usage logs with timestamp, user, prompt, response, model
 * - 4.3: Filter by date range (start date, end date)
 * - 4.4: Filter by user ID
 * - 4.5: Pagination with next/previous buttons
 * - 4.6: Export logs to CSV
 * - 5.7: Display audit logs showing admin actions
 */

import { Page, Locator, expect } from '@playwright/test';

export class LogViewerPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly usageLogsTab: Locator;
  readonly auditLogsTab: Locator;
  readonly startDatePicker: Locator;
  readonly endDatePicker: Locator;
  readonly userIdInput: Locator;
  readonly applyFiltersButton: Locator;
  readonly clearFiltersButton: Locator;
  readonly exportCsvButton: Locator;
  readonly logTable: Locator;
  readonly logRows: Locator;
  readonly auditLogTable: Locator;
  readonly auditLogRows: Locator;
  readonly paginationPrevious: Locator;
  readonly paginationNext: Locator;
  readonly loadingSpinner: Locator;
  readonly noLogsMessage: Locator;
  readonly activeFilters: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1');

    // Tabs
    this.usageLogsTab = page.locator(
      'button[role="tab"]:has-text("利用ログ"), button[role="tab"]:has-text("Usage Logs")'
    );
    this.auditLogsTab = page.locator(
      'button[role="tab"]:has-text("監査ログ"), button[role="tab"]:has-text("Audit Logs")'
    );

    // Filters
    this.startDatePicker = page
      .locator('input[placeholder*="開始日"], input[placeholder*="Start"]')
      .first();
    this.endDatePicker = page
      .locator('input[placeholder*="終了日"], input[placeholder*="End"]')
      .first();
    this.userIdInput = page.locator(
      'input[placeholder*="ユーザーID"], input[placeholder*="User ID"]'
    );
    this.applyFiltersButton = page.locator(
      'button:has-text("適用"), button:has-text("Apply")'
    );
    this.clearFiltersButton = page.locator(
      'button:has-text("クリア"), button:has-text("Clear")'
    );
    this.exportCsvButton = page.locator(
      'button:has-text("CSVエクスポート"), button:has-text("Export CSV")'
    );

    // Tables
    this.logTable = page.locator('table').first();
    this.logRows = page.locator('table tbody tr').first();
    this.auditLogTable = page.locator('table').last();
    this.auditLogRows = page.locator('table tbody tr');

    // Pagination
    this.paginationPrevious = page.locator(
      'button:has-text("前へ"), button:has-text("Previous")'
    );
    this.paginationNext = page.locator(
      'button:has-text("次へ"), button:has-text("Next")'
    );

    // Loading and empty states
    this.loadingSpinner = page.locator('.animate-spin');
    this.noLogsMessage = page.locator(
      'text=ログが見つかりません, text=No logs found'
    );
    this.activeFilters = page.locator('.bg-blue-100');
  }

  /**
   * Navigate to log viewer page
   */
  async goto(): Promise<void> {
    await this.page.goto('/admin/logs');
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
   * Wait for log list to load
   */
  async waitForLogList(): Promise<void> {
    await Promise.race([
      this.logTable.waitFor({ state: 'visible', timeout: 10000 }),
      this.noLogsMessage.waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Switch to usage logs tab
   */
  async switchToUsageLogs(): Promise<void> {
    await this.usageLogsTab.click();
    await this.waitForLogList();
  }

  /**
   * Switch to audit logs tab
   */
  async switchToAuditLogs(): Promise<void> {
    await this.auditLogsTab.click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Set start date filter
   * @param date - Date string in YYYY-MM-DD format
   */
  async setStartDate(date: string): Promise<void> {
    await this.startDatePicker.fill(date);
  }

  /**
   * Set end date filter
   * @param date - Date string in YYYY-MM-DD format
   */
  async setEndDate(date: string): Promise<void> {
    await this.endDatePicker.fill(date);
  }

  /**
   * Set user ID filter
   * @param userId - User ID to filter by
   */
  async setUserIdFilter(userId: string): Promise<void> {
    await this.userIdInput.fill(userId);
  }

  /**
   * Apply current filters
   */
  async applyFilters(): Promise<void> {
    await this.applyFiltersButton.click();
    await this.waitForLogList();
  }

  /**
   * Clear all filters
   */
  async clearFilters(): Promise<void> {
    await this.clearFiltersButton.click();
    await this.waitForLogList();
  }

  /**
   * Filter logs by date range
   * @param startDate - Start date in YYYY-MM-DD format
   * @param endDate - End date in YYYY-MM-DD format
   */
  async filterByDateRange(startDate: string, endDate: string): Promise<void> {
    await this.setStartDate(startDate);
    await this.setEndDate(endDate);
    await this.applyFilters();
  }

  /**
   * Filter logs by user ID
   * @param userId - User ID to filter by
   */
  async filterByUserId(userId: string): Promise<void> {
    await this.setUserIdFilter(userId);
    await this.applyFilters();
  }

  /**
   * Export logs to CSV
   */
  async exportCsv(): Promise<void> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportCsvButton.click();
    await downloadPromise;
  }

  /**
   * Get the number of logs displayed
   */
  async getLogCount(): Promise<number> {
    return await this.logRows.count();
  }

  /**
   * Get the number of audit logs displayed
   */
  async getAuditLogCount(): Promise<number> {
    return await this.auditLogRows.count();
  }

  /**
   * Navigate to next page
   */
  async nextPage(): Promise<void> {
    await this.paginationNext.click();
    await this.waitForLogList();
  }

  /**
   * Navigate to previous page
   */
  async previousPage(): Promise<void> {
    await this.paginationPrevious.click();
    await this.waitForLogList();
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
   * Check if filters are active
   */
  async hasActiveFilters(): Promise<boolean> {
    return await this.activeFilters.isVisible();
  }

  /**
   * Get log entry by index
   * @param index - Row index (0-based)
   */
  getLogRow(index: number): Locator {
    return this.logRows.nth(index);
  }

  /**
   * Get audit log entry by index
   * @param index - Row index (0-based)
   */
  getAuditLogRow(index: number): Locator {
    return this.auditLogRows.nth(index);
  }
}
