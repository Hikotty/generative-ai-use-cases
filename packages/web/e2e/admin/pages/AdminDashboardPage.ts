/**
 * Admin Dashboard Page Object
 *
 * Handles interactions with the admin dashboard page.
 */

import { Page, Locator, expect } from '@playwright/test';

export class AdminDashboardPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly sidebar: Locator;
  readonly usersLink: Locator;
  readonly logsLink: Locator;
  readonly costsLink: Locator;
  readonly statsLink: Locator;
  readonly settingsLink: Locator;
  readonly deployLink: Locator;
  readonly ragLink: Locator;
  readonly kpiCards: Locator;
  readonly recentAuditLogs: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1');
    this.sidebar = page.locator('[data-testid="admin-sidebar"], nav, aside');

    // Navigation links - using text content for i18n support
    this.usersLink = page.locator(
      'a[href="/admin/users"], a:has-text("ユーザー管理"), a:has-text("User Management")'
    );
    this.logsLink = page.locator(
      'a[href="/admin/logs"], a:has-text("ログ閲覧"), a:has-text("Log Viewer")'
    );
    this.costsLink = page.locator(
      'a[href="/admin/costs"], a:has-text("コスト監視"), a:has-text("Cost Monitoring")'
    );
    this.statsLink = page.locator(
      'a[href="/admin/stats"], a:has-text("使用統計"), a:has-text("Usage Statistics")'
    );
    this.settingsLink = page.locator(
      'a[href="/admin/settings"], a:has-text("アプリ設定"), a:has-text("App Settings")'
    );
    this.deployLink = page.locator(
      'a[href="/admin/deploy"], a:has-text("デプロイ"), a:has-text("Deploy")'
    );
    this.ragLink = page.locator(
      'a[href="/admin/rag"], a:has-text("RAG文書"), a:has-text("RAG Documents")'
    );

    // Dashboard components
    this.kpiCards = page.locator('[class*="Card"], .tremor-Card');
    this.recentAuditLogs = page.locator('table');
  }

  /**
   * Navigate to admin dashboard
   */
  async goto(): Promise<void> {
    await this.page.goto('/admin');
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
   * Navigate to User Management page
   */
  async navigateToUsers(): Promise<void> {
    await this.usersLink.click();
    await this.page.waitForURL('**/admin/users');
  }

  /**
   * Navigate to Log Viewer page
   */
  async navigateToLogs(): Promise<void> {
    await this.logsLink.click();
    await this.page.waitForURL('**/admin/logs');
  }

  /**
   * Navigate to Cost Monitoring page
   */
  async navigateToCosts(): Promise<void> {
    await this.costsLink.click();
    await this.page.waitForURL('**/admin/costs');
  }

  /**
   * Navigate to Usage Statistics page
   */
  async navigateToStats(): Promise<void> {
    await this.statsLink.click();
    await this.page.waitForURL('**/admin/stats');
  }

  /**
   * Navigate to App Settings page
   */
  async navigateToSettings(): Promise<void> {
    await this.settingsLink.click();
    await this.page.waitForURL('**/admin/settings');
  }

  /**
   * Navigate to Deploy Parameters page
   */
  async navigateToDeploy(): Promise<void> {
    await this.deployLink.click();
    await this.page.waitForURL('**/admin/deploy');
  }

  /**
   * Navigate to RAG Documents page
   */
  async navigateToRag(): Promise<void> {
    await this.ragLink.click();
    await this.page.waitForURL('**/admin/rag');
  }

  /**
   * Check if dashboard is displayed
   */
  async isDashboardVisible(): Promise<boolean> {
    return await this.pageTitle.isVisible();
  }

  /**
   * Get number of KPI cards displayed
   */
  async getKpiCardCount(): Promise<number> {
    return await this.kpiCards.count();
  }

  /**
   * Check if RAG link is visible (depends on ragEnabled)
   */
  async isRagLinkVisible(): Promise<boolean> {
    return await this.ragLink.isVisible();
  }
}
