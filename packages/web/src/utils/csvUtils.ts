/**
 * CSV Utility Functions
 *
 * Provides utilities for generating and downloading CSV files with UTF-8 BOM support.
 *
 * Requirements:
 * - 3.10: Download CSV template for bulk import
 * - 16.1: CSV template has header row with column names
 * - 16.2: CSV template includes example data row
 * - 16.3: CSV is UTF-8 encoded with BOM
 */

/**
 * UTF-8 BOM (Byte Order Mark)
 * Required for Excel to correctly recognize UTF-8 encoded CSV files
 */
export const UTF8_BOM = '\uFEFF';

/**
 * CSV Template headers for bulk user import
 * Requirement 16.1: CSV template has header row with column names
 */
export const CSV_TEMPLATE_HEADERS = ['email', 'isAdmin'];

/**
 * CSV Template example data row
 * Requirement 16.2: CSV template includes example data row
 */
export const CSV_TEMPLATE_EXAMPLE_ROW = ['user@example.com', 'false'];

/**
 * CSV Template comment explaining the isAdmin field
 */
export const CSV_TEMPLATE_COMMENT =
  '# isAdmin: true = 管理者権限を付与, false = 一般ユーザー';

/**
 * Generates CSV content with UTF-8 BOM
 *
 * @param headers - Array of header column names
 * @param rows - Array of data rows (each row is an array of values)
 * @param comment - Optional comment line to include at the top
 * @returns CSV content string with UTF-8 BOM
 *
 * Requirement 16.3: CSV is UTF-8 encoded with BOM
 */
export const generateCSVContent = (
  headers: string[],
  rows: string[][],
  comment?: string
): string => {
  const lines: string[] = [];

  // Add UTF-8 BOM at the beginning
  let content = UTF8_BOM;

  // Add comment line if provided
  if (comment) {
    lines.push(comment);
  }

  // Add header row
  lines.push(headers.join(','));

  // Add data rows
  for (const row of rows) {
    // Escape values that contain commas, quotes, or newlines
    const escapedRow = row.map((value) => escapeCSVValue(value));
    lines.push(escapedRow.join(','));
  }

  content += lines.join('\n');
  return content;
};

/**
 * Escapes a CSV value if it contains special characters
 *
 * @param value - The value to escape
 * @returns Escaped value (wrapped in quotes if necessary)
 */
export const escapeCSVValue = (value: string): string => {
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

/**
 * Generates the CSV template content for bulk user import
 *
 * Requirements:
 * - 16.1: CSV template has header row with column names
 * - 16.2: CSV template includes example data row
 * - 16.3: CSV is UTF-8 encoded with BOM
 *
 * @returns CSV template content string with UTF-8 BOM
 */
export const generateUserImportTemplate = (): string => {
  return generateCSVContent(
    CSV_TEMPLATE_HEADERS,
    [CSV_TEMPLATE_EXAMPLE_ROW],
    CSV_TEMPLATE_COMMENT
  );
};

/**
 * Triggers a browser download for the given content
 *
 * @param content - The file content to download
 * @param filename - The name of the file to download
 * @param mimeType - The MIME type of the file (default: text/csv)
 */
export const downloadFile = (
  content: string,
  filename: string,
  mimeType: string = 'text/csv;charset=utf-8'
): void => {
  // Create a Blob with the content
  const blob = new Blob([content], { type: mimeType });

  // Create a temporary URL for the blob
  const url = URL.createObjectURL(blob);

  // Create a temporary anchor element to trigger the download
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object
  URL.revokeObjectURL(url);
};

/**
 * Downloads the CSV template for bulk user import
 *
 * Requirements:
 * - 3.10: Download CSV template for bulk import
 * - 16.1: CSV template has header row with column names
 * - 16.2: CSV template includes example data row
 * - 16.3: CSV is UTF-8 encoded with BOM
 */
export const downloadUserImportTemplate = (): void => {
  const content = generateUserImportTemplate();
  downloadFile(content, 'user_import_template.csv');
};

/**
 * CSV Export headers for user list export
 * Requirement 16.4: CSV export has header row
 */
export const CSV_EXPORT_HEADERS = ['email', 'isAdmin', 'status', 'createdAt'];

/**
 * User data interface for CSV export
 */
export interface UserExportData {
  email: string;
  isAdmin: boolean;
  status: 'active' | 'disabled';
  createdAt: string;
}

/**
 * Generates the current date in YYYY-MM-DD format
 *
 * Requirement 16.7: CSV export filename format: users_YYYY-MM-DD.csv
 *
 * @returns Date string in YYYY-MM-DD format
 */
export const getCurrentDateString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Generates the filename for user export CSV
 *
 * Requirement 16.7: CSV export filename format: users_YYYY-MM-DD.csv
 *
 * @returns Filename string with current date
 */
export const generateUserExportFilename = (): string => {
  return `users_${getCurrentDateString()}.csv`;
};

/**
 * Converts user data to CSV row format
 *
 * Requirements:
 * - 16.4: CSV export has header row
 * - 16.5: CSV export includes all user data (email, role, status, created date)
 * - 16.6: isAdmin column has true or false value
 * - 16.7: createdAt column has ISO 8601 format
 *
 * @param user - User data to convert
 * @returns Array of string values for CSV row
 */
export const userToCSVRow = (user: UserExportData): string[] => {
  return [
    user.email,
    user.isAdmin ? 'true' : 'false',
    user.status,
    user.createdAt,
  ];
};

/**
 * Generates CSV content for user list export
 *
 * Requirements:
 * - 3.11: Export user list to CSV
 * - 3.14: CSV export includes all user data (email, role, status, created date)
 * - 16.4: CSV export has header row
 * - 16.5: CSV export includes all users
 * - 16.6: CSV export is UTF-8 encoded with BOM
 *
 * @param users - Array of user data to export
 * @returns CSV content string with UTF-8 BOM
 */
export const generateUserExportCSV = (users: UserExportData[]): string => {
  const rows = users.map(userToCSVRow);
  return generateCSVContent(CSV_EXPORT_HEADERS, rows);
};

/**
 * Downloads user list as CSV file
 *
 * Requirements:
 * - 3.11: Export user list to CSV
 * - 3.14: CSV export includes all user data (email, role, status, created date)
 * - 3.15: CSV filename includes export date
 * - 16.4: CSV export has header row
 * - 16.5: CSV export includes all users
 * - 16.6: CSV export is UTF-8 encoded with BOM
 * - 16.7: CSV export filename format: users_YYYY-MM-DD.csv
 *
 * @param users - Array of user data to export
 */
export const downloadUserExportCSV = (users: UserExportData[]): void => {
  const content = generateUserExportCSV(users);
  const filename = generateUserExportFilename();
  downloadFile(content, filename);
};
