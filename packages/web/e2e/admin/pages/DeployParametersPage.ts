/**
 * Deploy Parameters Page Object
 *
 * Handles interactions with the deploy parameters page.
 *
 * Requirements:
 * - 17.1: Display current cdk.json parameter values
 * - 17.2: Display editable parameters (toggles for boolean, text inputs for strings)
 * - 17.4: Generate CloudFormation template button
 * - 17.6: Display Quick Create Link
 * - 17.7: "Open in CloudFormation Console" button
 * - 17.8: Template download link
 * - 17.10: Display change history with past settings and Quick Create Links
 */

import { Page, Locator, expect } from '@playwright/test';

export class DeployParametersPage {
  readonly page: Page;
  readonly pageTitle: Locator;

  // Feature toggles
  readonly ragEnabledToggle: Locator;
  readonly agentEnabledToggle: Locator;
  readonly useCaseBuilderEnabledToggle: Locator;

  // Configuration inputs
  readonly modelIdInput: Locator;
  readonly stackNameInput: Locator;
  readonly searchApiKeyInput: Locator;

  // Template generation
  readonly generateTemplateButton: Locator;
  readonly generatingSpinner: Locator;
  readonly quickCreateLinkInput: Locator;
  readonly copyLinkButton: Locator;
  readonly openConsoleButton: Locator;
  readonly downloadTemplateButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  // History section
  readonly historyTable: Locator;
  readonly historyRows: Locator;
  readonly noHistoryMessage: Locator;

  // Validation
  readonly validationErrors: Locator;
  readonly unsavedChangesBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1');

    // Feature toggles
    this.ragEnabledToggle = page.locator('[role="switch"]:near(:text("RAG"))');
    this.agentEnabledToggle = page.locator(
      '[role="switch"]:near(:text("Agent"))'
    );
    this.useCaseBuilderEnabledToggle = page.locator(
      '[role="switch"]:near(:text("UseCaseBuilder"))'
    );

    // Configuration inputs
    this.modelIdInput = page.locator(
      'input:near(:text("Model ID")), input:near(:text("モデルID"))'
    );
    this.stackNameInput = page.locator(
      'input:near(:text("Stack Name")), input:near(:text("スタック名"))'
    );
    this.searchApiKeyInput = page.locator(
      'input:near(:text("Search API Key")), input:near(:text("検索APIキー"))'
    );

    // Template generation
    this.generateTemplateButton = page.locator(
      'button:has-text("テンプレートを生成"), button:has-text("Generate Template")'
    );
    this.generatingSpinner = page.locator('button:has(.animate-spin)');
    this.quickCreateLinkInput = page.locator(
      'input[readonly]:has-text("cloudformation")'
    );
    this.copyLinkButton = page.locator(
      'button:has-text("コピー"), button:has-text("Copy")'
    );
    this.openConsoleButton = page.locator(
      'button:has-text("コンソールで開く"), button:has-text("Open Console")'
    );
    this.downloadTemplateButton = page.locator(
      'button:has-text("ダウンロード"), button:has-text("Download")'
    );
    this.successMessage = page.locator(
      '[class*="Callout"][color="green"], .bg-green-50'
    );
    this.errorMessage = page.locator(
      '[class*="Callout"][color="red"], .bg-red-50'
    );

    // History section
    this.historyTable = page.locator(
      'table:near(:text("履歴")), table:near(:text("History"))'
    );
    this.historyRows = page.locator(
      'table:near(:text("履歴")) tbody tr, table:near(:text("History")) tbody tr'
    );
    this.noHistoryMessage = page.locator(
      'text=履歴がありません, text=No history'
    );

    // Validation
    this.validationErrors = page.locator('.text-red-600, .text-red-700');
    this.unsavedChangesBadge = page.locator(
      '[class*="Badge"]:has-text("未保存"), [class*="Badge"]:has-text("Unsaved")'
    );
  }

  /**
   * Navigate to deploy parameters page
   */
  async goto(): Promise<void> {
    await this.page.goto('/admin/deploy');
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
   * Toggle RAG enabled
   */
  async toggleRagEnabled(): Promise<void> {
    await this.ragEnabledToggle.click();
  }

  /**
   * Toggle Agent enabled
   */
  async toggleAgentEnabled(): Promise<void> {
    await this.agentEnabledToggle.click();
  }

  /**
   * Toggle UseCaseBuilder enabled
   */
  async toggleUseCaseBuilderEnabled(): Promise<void> {
    await this.useCaseBuilderEnabledToggle.click();
  }

  /**
   * Set model ID
   * @param modelId - Model ID to set
   */
  async setModelId(modelId: string): Promise<void> {
    await this.modelIdInput.fill(modelId);
  }

  /**
   * Set stack name
   * @param stackName - Stack name to set
   */
  async setStackName(stackName: string): Promise<void> {
    await this.stackNameInput.fill(stackName);
  }

  /**
   * Generate CloudFormation template
   */
  async generateTemplate(): Promise<void> {
    await this.generateTemplateButton.click();

    // Wait for generation to complete
    await expect(this.generatingSpinner).not.toBeVisible({ timeout: 120000 });

    // Wait for success or error message
    await Promise.race([
      this.successMessage.waitFor({ state: 'visible', timeout: 5000 }),
      this.errorMessage.waitFor({ state: 'visible', timeout: 5000 }),
    ]);
  }

  /**
   * Check if template was generated successfully
   */
  async isTemplateGenerated(): Promise<boolean> {
    return await this.successMessage.isVisible();
  }

  /**
   * Check if there was an error generating template
   */
  async hasGenerationError(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Copy Quick Create Link to clipboard
   */
  async copyQuickCreateLink(): Promise<void> {
    await this.copyLinkButton.click();
    // Wait for copy confirmation
    await this.page.waitForTimeout(500);
  }

  /**
   * Open CloudFormation console
   * Note: This will open a new tab
   */
  async openCloudFormationConsole(): Promise<void> {
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page'),
      this.openConsoleButton.click(),
    ]);
    await newPage.close();
  }

  /**
   * Download template
   */
  async downloadTemplate(): Promise<void> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.downloadTemplateButton.click();
    await downloadPromise;
  }

  /**
   * Get the number of history entries
   */
  async getHistoryCount(): Promise<number> {
    return await this.historyRows.count();
  }

  /**
   * Check if there are validation errors
   */
  async hasValidationErrors(): Promise<boolean> {
    return await this.validationErrors.isVisible();
  }

  /**
   * Check if there are unsaved changes
   */
  async hasUnsavedChanges(): Promise<boolean> {
    return await this.unsavedChangesBadge.isVisible();
  }

  /**
   * Get history entry by index
   * @param index - Row index (0-based)
   */
  getHistoryRow(index: number): Locator {
    return this.historyRows.nth(index);
  }

  /**
   * Open CloudFormation console for a history entry
   * @param index - History entry index
   */
  async openHistoryConsole(index: number): Promise<void> {
    const row = this.getHistoryRow(index);
    const openButton = row.locator(
      'button:has-text("開く"), button:has-text("Open")'
    );

    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page'),
      openButton.click(),
    ]);
    await newPage.close();
  }

  /**
   * Download template for a history entry
   * @param index - History entry index
   */
  async downloadHistoryTemplate(index: number): Promise<void> {
    const row = this.getHistoryRow(index);
    const downloadButton = row.locator(
      'button:has-text("ダウンロード"), button:has-text("Download")'
    );

    const downloadPromise = this.page.waitForEvent('download');
    await downloadButton.click();
    await downloadPromise;
  }
}
