/**
 * RAG Documents Page Object
 *
 * Handles interactions with the RAG document management page.
 *
 * Requirements:
 * - 20.1: Check sync job status on page access
 * - 20.2: Show warning message and disable buttons when sync is IN_PROGRESS
 * - 20.4: Display document list from Knowledge Base data source
 * - 20.6: Support file upload
 * - 20.16: Delete document
 * - 20.17: Download document
 * - 20.21: Search functionality to filter documents by file name
 */

import { Page, Locator, expect } from '@playwright/test';

export class RagDocumentsPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly searchInput: Locator;
  readonly uploadButton: Locator;
  readonly documentTable: Locator;
  readonly documentRows: Locator;
  readonly syncStatusBadge: Locator;
  readonly syncWarningBanner: Locator;
  readonly loadingSpinner: Locator;
  readonly noDocumentsMessage: Locator;
  readonly syncHistorySection: Locator;

  // Upload Dialog
  readonly uploadDialog: Locator;
  readonly dropZone: Locator;
  readonly fileInput: Locator;
  readonly selectedFilesList: Locator;
  readonly uploadProgressBar: Locator;
  readonly startUploadButton: Locator;
  readonly cancelUploadButton: Locator;
  readonly clearFilesButton: Locator;
  readonly uploadSuccessMessage: Locator;

  // Delete Confirmation Dialog
  readonly deleteDialog: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  // Preview Dialog
  readonly previewDialog: Locator;
  readonly previewContent: Locator;
  readonly previewCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h1');
    this.searchInput = page.locator(
      'input[placeholder*="検索"], input[placeholder*="Search"]'
    );
    this.uploadButton = page.locator(
      'button:has-text("アップロード"), button:has-text("Upload")'
    );
    this.documentTable = page.locator('table');
    this.documentRows = page.locator('table tbody tr');
    this.syncStatusBadge = page.locator(
      '[class*="Badge"]:has-text("同期"), [class*="Badge"]:has-text("Sync")'
    );
    this.syncWarningBanner = page.locator(
      '[class*="Callout"][color="yellow"], .bg-yellow-50'
    );
    this.loadingSpinner = page.locator('.animate-spin');
    this.noDocumentsMessage = page.locator(
      'text=文書が見つかりません, text=No documents found'
    );
    this.syncHistorySection = page.locator('text=同期履歴, text=Sync History');

    // Upload Dialog
    this.uploadDialog = page.locator(
      '.fixed.inset-0:has(button:has-text("アップロード")), .fixed.inset-0:has(button:has-text("Upload"))'
    );
    this.dropZone = page.locator('.border-dashed');
    this.fileInput = page.locator('input[type="file"]');
    this.selectedFilesList = page.locator('.space-y-2:has(.border)');
    this.uploadProgressBar = page.locator('[class*="ProgressBar"]');
    this.startUploadButton = page.locator(
      'button:has-text("アップロード開始"), button:has-text("Start Upload")'
    );
    this.cancelUploadButton = page.locator(
      'button:has-text("キャンセル"), button:has-text("Cancel")'
    );
    this.clearFilesButton = page.locator(
      'button:has-text("クリア"), button:has-text("Clear")'
    );
    this.uploadSuccessMessage = page.locator(
      'text=アップロード完了, text=Upload Complete'
    );

    // Delete Confirmation Dialog
    this.deleteDialog = page.locator(
      '.fixed.inset-0:has(button:has-text("削除")), .fixed.inset-0:has(button:has-text("Delete"))'
    );
    this.deleteConfirmButton = page
      .locator(
        '.fixed.inset-0 button:has-text("削除する"), .fixed.inset-0 button:has-text("Delete")'
      )
      .last();
    this.deleteCancelButton = page.locator(
      '.fixed.inset-0 button:has-text("キャンセル"), .fixed.inset-0 button:has-text("Cancel")'
    );

    // Preview Dialog
    this.previewDialog = page.locator(
      '.fixed.inset-0:has(pre), .fixed.inset-0:has(.whitespace-pre-wrap)'
    );
    this.previewContent = page.locator('pre, .whitespace-pre-wrap');
    this.previewCloseButton = page
      .locator('.fixed.inset-0 button:has(svg)')
      .first();
  }

  /**
   * Navigate to RAG documents page
   */
  async goto(): Promise<void> {
    await this.page.goto('/admin/rag');
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
   * Wait for document list to load
   */
  async waitForDocumentList(): Promise<void> {
    await Promise.race([
      this.documentTable.waitFor({ state: 'visible', timeout: 10000 }),
      this.noDocumentsMessage.waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Search for documents by file name
   * @param query - Search query
   */
  async searchDocuments(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500);
    await this.waitForDocumentList();
  }

  /**
   * Clear search input
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
    await this.page.waitForTimeout(500);
    await this.waitForDocumentList();
  }

  /**
   * Check if sync is in progress
   */
  async isSyncInProgress(): Promise<boolean> {
    return await this.syncWarningBanner.isVisible();
  }

  /**
   * Check if upload button is enabled
   */
  async isUploadEnabled(): Promise<boolean> {
    return await this.uploadButton.isEnabled();
  }

  /**
   * Open upload dialog
   */
  async openUploadDialog(): Promise<void> {
    await this.uploadButton.click();
    await expect(this.uploadDialog).toBeVisible({ timeout: 5000 });
  }

  /**
   * Upload a file
   * @param filePath - Path to the file to upload
   */
  async uploadFile(filePath: string): Promise<void> {
    await this.openUploadDialog();

    // Set file input
    await this.fileInput.setInputFiles(filePath);

    // Wait for file to be added to the list
    await this.page.waitForTimeout(500);

    // Start upload
    await this.startUploadButton.click();

    // Wait for upload to complete
    await expect(this.uploadSuccessMessage).toBeVisible({ timeout: 30000 });

    // Wait for dialog to close
    await this.page.waitForTimeout(2000);
  }

  /**
   * Upload multiple files
   * @param filePaths - Array of file paths to upload
   */
  async uploadFiles(filePaths: string[]): Promise<void> {
    await this.openUploadDialog();

    // Set file inputs
    await this.fileInput.setInputFiles(filePaths);

    // Wait for files to be added to the list
    await this.page.waitForTimeout(500);

    // Start upload
    await this.startUploadButton.click();

    // Wait for upload to complete
    await expect(this.uploadSuccessMessage).toBeVisible({ timeout: 60000 });

    // Wait for dialog to close
    await this.page.waitForTimeout(2000);
  }

  /**
   * Cancel upload dialog
   */
  async cancelUpload(): Promise<void> {
    await this.cancelUploadButton.click();
    await expect(this.uploadDialog).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Get document row by file name
   * @param fileName - File name to find
   */
  getDocumentRowByName(fileName: string): Locator {
    return this.page.locator(`table tbody tr:has-text("${fileName}")`);
  }

  /**
   * Download a document
   * @param fileName - File name to download
   */
  async downloadDocument(fileName: string): Promise<void> {
    const row = this.getDocumentRowByName(fileName);
    const downloadButton = row.locator('button:has(svg[class*="Download"])');

    const downloadPromise = this.page.waitForEvent('download');
    await downloadButton.click();
    await downloadPromise;
  }

  /**
   * Delete a document
   * @param fileName - File name to delete
   */
  async deleteDocument(fileName: string): Promise<void> {
    const row = this.getDocumentRowByName(fileName);
    const deleteButton = row.locator('button:has(svg[class*="Trash"])');
    await deleteButton.click();

    // Wait for confirmation dialog
    await expect(this.deleteDialog).toBeVisible({ timeout: 5000 });

    // Confirm deletion
    await this.deleteConfirmButton.click();

    // Wait for dialog to close
    await expect(this.deleteDialog).not.toBeVisible({ timeout: 10000 });
  }

  /**
   * Preview a document
   * @param fileName - File name to preview
   */
  async previewDocument(fileName: string): Promise<void> {
    const row = this.getDocumentRowByName(fileName);
    const previewButton = row.locator('button:has(svg[class*="Eye"])');
    await previewButton.click();

    // Wait for preview dialog
    await expect(this.previewDialog).toBeVisible({ timeout: 5000 });
  }

  /**
   * Close preview dialog
   */
  async closePreview(): Promise<void> {
    await this.previewCloseButton.click();
    await expect(this.previewDialog).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Get the number of documents displayed
   */
  async getDocumentCount(): Promise<number> {
    return await this.documentRows.count();
  }

  /**
   * Check if a document exists in the list
   * @param fileName - File name to check
   */
  async documentExists(fileName: string): Promise<boolean> {
    const row = this.getDocumentRowByName(fileName);
    return await row.isVisible();
  }

  /**
   * Wait for sync to complete
   * @param timeout - Maximum time to wait in milliseconds
   */
  async waitForSyncComplete(timeout: number = 60000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (!(await this.isSyncInProgress())) {
        return;
      }
      await this.page.waitForTimeout(5000);
      await this.page.reload();
      await this.waitForPageLoad();
    }
    throw new Error('Sync did not complete within timeout');
  }
}
