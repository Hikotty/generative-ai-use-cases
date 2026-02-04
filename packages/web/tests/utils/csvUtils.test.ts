/**
 * Unit tests for CSV utility functions
 *
 * Tests the CSV generation and download functionality for the admin dashboard.
 *
 * Requirements:
 * - 3.10: Download CSV template for bulk import
 * - 16.1: CSV template has header row with column names
 * - 16.2: CSV template includes example data row
 * - 16.3: CSV is UTF-8 encoded with BOM
 */

import { describe, expect, test } from 'vitest';
import {
  UTF8_BOM,
  CSV_TEMPLATE_HEADERS,
  CSV_TEMPLATE_EXAMPLE_ROW,
  CSV_TEMPLATE_COMMENT,
  CSV_EXPORT_HEADERS,
  generateCSVContent,
  escapeCSVValue,
  generateUserImportTemplate,
  getCurrentDateString,
  generateUserExportFilename,
  userToCSVRow,
  generateUserExportCSV,
  UserExportData,
} from '../../src/utils/csvUtils';

describe('CSV Utility Functions', () => {
  describe('UTF8_BOM constant', () => {
    test('should be the correct UTF-8 BOM character', () => {
      expect(UTF8_BOM).toBe('\uFEFF');
    });
  });

  describe('CSV_TEMPLATE_HEADERS constant', () => {
    test('should contain email and isAdmin headers', () => {
      expect(CSV_TEMPLATE_HEADERS).toEqual(['email', 'isAdmin']);
    });
  });

  describe('CSV_TEMPLATE_EXAMPLE_ROW constant', () => {
    test('should contain example email and false for isAdmin', () => {
      expect(CSV_TEMPLATE_EXAMPLE_ROW).toEqual(['user@example.com', 'false']);
    });
  });

  describe('CSV_TEMPLATE_COMMENT constant', () => {
    test('should contain the comment explaining isAdmin field', () => {
      expect(CSV_TEMPLATE_COMMENT).toBe(
        '# isAdmin: true = 管理者権限を付与, false = 一般ユーザー'
      );
    });
  });

  describe('escapeCSVValue', () => {
    test('should return value unchanged if no special characters', () => {
      expect(escapeCSVValue('simple')).toBe('simple');
      expect(escapeCSVValue('user@example.com')).toBe('user@example.com');
      expect(escapeCSVValue('true')).toBe('true');
    });

    test('should wrap value in quotes if it contains comma', () => {
      expect(escapeCSVValue('value,with,commas')).toBe('"value,with,commas"');
    });

    test('should wrap value in quotes and escape internal quotes', () => {
      expect(escapeCSVValue('value"with"quotes')).toBe('"value""with""quotes"');
    });

    test('should wrap value in quotes if it contains newline', () => {
      expect(escapeCSVValue('value\nwith\nnewlines')).toBe(
        '"value\nwith\nnewlines"'
      );
    });

    test('should handle combination of special characters', () => {
      expect(escapeCSVValue('value,"with",all\nspecial')).toBe(
        '"value,""with"",all\nspecial"'
      );
    });
  });

  describe('generateCSVContent', () => {
    test('should start with UTF-8 BOM', () => {
      const content = generateCSVContent(['header'], [['value']]);
      expect(content.startsWith(UTF8_BOM)).toBe(true);
    });

    test('should include header row', () => {
      const content = generateCSVContent(['col1', 'col2'], [['val1', 'val2']]);
      expect(content).toContain('col1,col2');
    });

    test('should include data rows', () => {
      const content = generateCSVContent(
        ['col1', 'col2'],
        [
          ['row1val1', 'row1val2'],
          ['row2val1', 'row2val2'],
        ]
      );
      expect(content).toContain('row1val1,row1val2');
      expect(content).toContain('row2val1,row2val2');
    });

    test('should include comment when provided', () => {
      const content = generateCSVContent(
        ['header'],
        [['value']],
        '# This is a comment'
      );
      expect(content).toContain('# This is a comment');
    });

    test('should place comment before header', () => {
      const content = generateCSVContent(
        ['header'],
        [['value']],
        '# Comment'
      );
      const commentIndex = content.indexOf('# Comment');
      const headerIndex = content.indexOf('header');
      expect(commentIndex).toBeLessThan(headerIndex);
    });

    test('should escape values with special characters', () => {
      const content = generateCSVContent(
        ['header'],
        [['value,with,commas']]
      );
      expect(content).toContain('"value,with,commas"');
    });

    test('should separate rows with newlines', () => {
      const content = generateCSVContent(
        ['header'],
        [['row1'], ['row2']]
      );
      const lines = content.replace(UTF8_BOM, '').split('\n');
      expect(lines.length).toBe(3); // header + 2 data rows
    });
  });

  describe('generateUserImportTemplate', () => {
    test('should start with UTF-8 BOM (Requirement 16.3)', () => {
      const template = generateUserImportTemplate();
      expect(template.startsWith(UTF8_BOM)).toBe(true);
    });

    test('should include header row with email and isAdmin (Requirement 16.1)', () => {
      const template = generateUserImportTemplate();
      expect(template).toContain('email,isAdmin');
    });

    test('should include example data row (Requirement 16.2)', () => {
      const template = generateUserImportTemplate();
      expect(template).toContain('user@example.com,false');
    });

    test('should include comment explaining isAdmin field', () => {
      const template = generateUserImportTemplate();
      expect(template).toContain(
        '# isAdmin: true = 管理者権限を付与, false = 一般ユーザー'
      );
    });

    test('should have correct structure: BOM, comment, header, example', () => {
      const template = generateUserImportTemplate();
      const content = template.replace(UTF8_BOM, '');
      const lines = content.split('\n');

      expect(lines.length).toBe(3);
      expect(lines[0]).toBe(
        '# isAdmin: true = 管理者権限を付与, false = 一般ユーザー'
      );
      expect(lines[1]).toBe('email,isAdmin');
      expect(lines[2]).toBe('user@example.com,false');
    });
  });
});


/**
 * Unit tests for CSV export functionality
 *
 * Requirements:
 * - 3.11: Export user list to CSV
 * - 3.14: CSV export includes all user data (email, role, status, created date)
 * - 3.15: CSV filename includes export date
 * - 16.4: CSV export has header row
 * - 16.5: CSV export includes all users
 * - 16.6: CSV export is UTF-8 encoded with BOM
 * - 16.7: CSV export filename format: users_YYYY-MM-DD.csv
 */
describe('CSV Export Functions', () => {
  describe('CSV_EXPORT_HEADERS constant', () => {
    test('should contain email, isAdmin, status, createdAt headers (Requirement 16.4)', () => {
      expect(CSV_EXPORT_HEADERS).toEqual(['email', 'isAdmin', 'status', 'createdAt']);
    });
  });

  describe('getCurrentDateString', () => {
    test('should return date in YYYY-MM-DD format', () => {
      const dateString = getCurrentDateString();
      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('should return current date', () => {
      const dateString = getCurrentDateString();
      const now = new Date();
      const expectedYear = now.getFullYear().toString();
      const expectedMonth = String(now.getMonth() + 1).padStart(2, '0');
      const expectedDay = String(now.getDate()).padStart(2, '0');
      expect(dateString).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
    });
  });

  describe('generateUserExportFilename', () => {
    test('should return filename with users_ prefix (Requirement 16.7)', () => {
      const filename = generateUserExportFilename();
      expect(filename.startsWith('users_')).toBe(true);
    });

    test('should return filename with .csv extension (Requirement 16.7)', () => {
      const filename = generateUserExportFilename();
      expect(filename.endsWith('.csv')).toBe(true);
    });

    test('should include current date in filename (Requirement 3.15, 16.7)', () => {
      const filename = generateUserExportFilename();
      const dateString = getCurrentDateString();
      expect(filename).toBe(`users_${dateString}.csv`);
    });

    test('should match format users_YYYY-MM-DD.csv (Requirement 16.7)', () => {
      const filename = generateUserExportFilename();
      expect(filename).toMatch(/^users_\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });

  describe('userToCSVRow', () => {
    test('should convert user data to CSV row array', () => {
      const user: UserExportData = {
        email: 'test@example.com',
        isAdmin: true,
        status: 'active',
        createdAt: '2025-01-22T10:00:00Z',
      };
      const row = userToCSVRow(user);
      expect(row).toEqual(['test@example.com', 'true', 'active', '2025-01-22T10:00:00Z']);
    });

    test('should convert isAdmin true to "true" string (Requirement 16.5)', () => {
      const user: UserExportData = {
        email: 'admin@example.com',
        isAdmin: true,
        status: 'active',
        createdAt: '2025-01-22T10:00:00Z',
      };
      const row = userToCSVRow(user);
      expect(row[1]).toBe('true');
    });

    test('should convert isAdmin false to "false" string (Requirement 16.5)', () => {
      const user: UserExportData = {
        email: 'user@example.com',
        isAdmin: false,
        status: 'active',
        createdAt: '2025-01-22T10:00:00Z',
      };
      const row = userToCSVRow(user);
      expect(row[1]).toBe('false');
    });

    test('should preserve status value (Requirement 16.6)', () => {
      const activeUser: UserExportData = {
        email: 'active@example.com',
        isAdmin: false,
        status: 'active',
        createdAt: '2025-01-22T10:00:00Z',
      };
      const disabledUser: UserExportData = {
        email: 'disabled@example.com',
        isAdmin: false,
        status: 'disabled',
        createdAt: '2025-01-22T10:00:00Z',
      };
      expect(userToCSVRow(activeUser)[2]).toBe('active');
      expect(userToCSVRow(disabledUser)[2]).toBe('disabled');
    });

    test('should preserve createdAt ISO 8601 format (Requirement 16.7)', () => {
      const user: UserExportData = {
        email: 'test@example.com',
        isAdmin: false,
        status: 'active',
        createdAt: '2025-01-22T10:30:45.123Z',
      };
      const row = userToCSVRow(user);
      expect(row[3]).toBe('2025-01-22T10:30:45.123Z');
    });
  });

  describe('generateUserExportCSV', () => {
    test('should start with UTF-8 BOM (Requirement 16.6)', () => {
      const users: UserExportData[] = [
        {
          email: 'test@example.com',
          isAdmin: false,
          status: 'active',
          createdAt: '2025-01-22T10:00:00Z',
        },
      ];
      const csv = generateUserExportCSV(users);
      expect(csv.startsWith(UTF8_BOM)).toBe(true);
    });

    test('should include header row (Requirement 16.4)', () => {
      const users: UserExportData[] = [];
      const csv = generateUserExportCSV(users);
      expect(csv).toContain('email,isAdmin,status,createdAt');
    });

    test('should include all user data (Requirement 3.14, 16.5)', () => {
      const users: UserExportData[] = [
        {
          email: 'user1@example.com',
          isAdmin: true,
          status: 'active',
          createdAt: '2025-01-22T10:00:00Z',
        },
        {
          email: 'user2@example.com',
          isAdmin: false,
          status: 'disabled',
          createdAt: '2025-01-23T11:00:00Z',
        },
      ];
      const csv = generateUserExportCSV(users);
      expect(csv).toContain('user1@example.com,true,active,2025-01-22T10:00:00Z');
      expect(csv).toContain('user2@example.com,false,disabled,2025-01-23T11:00:00Z');
    });

    test('should handle empty user list', () => {
      const users: UserExportData[] = [];
      const csv = generateUserExportCSV(users);
      const content = csv.replace(UTF8_BOM, '');
      const lines = content.split('\n');
      expect(lines.length).toBe(1); // Only header row
      expect(lines[0]).toBe('email,isAdmin,status,createdAt');
    });

    test('should handle users with special characters in email', () => {
      const users: UserExportData[] = [
        {
          email: 'user+tag@example.com',
          isAdmin: false,
          status: 'active',
          createdAt: '2025-01-22T10:00:00Z',
        },
      ];
      const csv = generateUserExportCSV(users);
      expect(csv).toContain('user+tag@example.com');
    });

    test('should have correct structure: BOM, header, data rows', () => {
      const users: UserExportData[] = [
        {
          email: 'user1@example.com',
          isAdmin: true,
          status: 'active',
          createdAt: '2025-01-22T10:00:00Z',
        },
        {
          email: 'user2@example.com',
          isAdmin: false,
          status: 'disabled',
          createdAt: '2025-01-23T11:00:00Z',
        },
      ];
      const csv = generateUserExportCSV(users);
      const content = csv.replace(UTF8_BOM, '');
      const lines = content.split('\n');

      expect(lines.length).toBe(3); // header + 2 data rows
      expect(lines[0]).toBe('email,isAdmin,status,createdAt');
      expect(lines[1]).toBe('user1@example.com,true,active,2025-01-22T10:00:00Z');
      expect(lines[2]).toBe('user2@example.com,false,disabled,2025-01-23T11:00:00Z');
    });
  });
});
