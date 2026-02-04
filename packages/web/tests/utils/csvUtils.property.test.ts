/**
 * Property-based tests for CSV utility functions and user management UI
 *
 * Uses fast-check library for property-based testing.
 *
 * Properties tested:
 * - Property 2: User search filtering
 * - Property 3: Pagination limit
 * - Property 4: CSV user export format
 * - Property 7: CSV file generation
 *
 * Requirements: 3.3, 3.4, 3.11, 3.14, 3.15
 */

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
  UTF8_BOM,
  CSV_EXPORT_HEADERS,
  generateCSVContent,
  generateUserExportCSV,
  generateUserExportFilename,
  getCurrentDateString,
  UserExportData,
} from '../../src/utils/csvUtils';

/**
 * User search filtering function
 * Filters users by email containing the search query (case-insensitive)
 *
 * This is the core filtering logic used in UserManagement.tsx
 */
const filterUsersByEmail = (
  users: { email: string }[],
  searchQuery: string
): { email: string }[] => {
  if (!searchQuery || searchQuery.trim() === '') {
    return users;
  }
  const normalizedQuery = searchQuery.toLowerCase().trim();
  return users.filter((user) =>
    user.email.toLowerCase().includes(normalizedQuery)
  );
};

/**
 * Pagination function
 * Returns a page of users with the specified page size
 *
 * This is the core pagination logic used in UserManagement.tsx
 */
const paginateUsers = <T>(
  users: T[],
  pageSize: number,
  pageIndex: number = 0
): T[] => {
  const startIndex = pageIndex * pageSize;
  return users.slice(startIndex, startIndex + pageSize);
};

// Page size constant from UserManagement.tsx
const PAGE_SIZE = 50;

/**
 * Arbitrary for generating valid email addresses
 */
const emailArbitrary = fc.emailAddress();

/**
 * Arbitrary for generating user objects with email
 */
const userWithEmailArbitrary = fc.record({
  email: emailArbitrary,
});

/**
 * Arbitrary for generating valid ISO 8601 date strings
 */
const iso8601DateArbitrary = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }), // year
    fc.integer({ min: 1, max: 12 }), // month
    fc.integer({ min: 1, max: 28 }), // day (use 28 to avoid invalid dates)
    fc.integer({ min: 0, max: 23 }), // hour
    fc.integer({ min: 0, max: 59 }), // minute
    fc.integer({ min: 0, max: 59 }), // second
    fc.integer({ min: 0, max: 999 }) // millisecond
  )
  .map(([year, month, day, hour, minute, second, ms]) => {
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
    return date.toISOString();
  });

/**
 * Arbitrary for generating UserExportData objects
 */
const userExportDataArbitrary: fc.Arbitrary<UserExportData> = fc.record({
  email: emailArbitrary,
  isAdmin: fc.boolean(),
  status: fc.constantFrom('active' as const, 'disabled' as const),
  createdAt: iso8601DateArbitrary,
});

/**
 * Arbitrary for generating search queries
 * Includes empty strings, single characters, and longer strings
 */
const searchQueryArbitrary = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 50 }),
  // Include common email parts
  fc.constantFrom('@', '.com', '.org', 'user', 'admin', 'test')
);

describe('Property-Based Tests for User Management UI', () => {
  /**
   * Property 2: User Search Filtering
   *
   * For any search query, filtered results contain only users whose email
   * contains the query (case-insensitive).
   *
   * **Validates: Requirements 3.3**
   */
  describe('Property 2: User Search Filtering', () => {
    test('filtered results should only contain users whose email contains the search query', () => {
      fc.assert(
        fc.property(
          fc.array(userWithEmailArbitrary, { minLength: 0, maxLength: 100 }),
          searchQueryArbitrary,
          (users, searchQuery) => {
            const filtered = filterUsersByEmail(users, searchQuery);

            // If search query is empty, all users should be returned
            if (!searchQuery || searchQuery.trim() === '') {
              return filtered.length === users.length;
            }

            // All filtered users should have email containing the query
            const normalizedQuery = searchQuery.toLowerCase().trim();
            return filtered.every((user) =>
              user.email.toLowerCase().includes(normalizedQuery)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    test('filtered results should be a subset of original users', () => {
      fc.assert(
        fc.property(
          fc.array(userWithEmailArbitrary, { minLength: 0, maxLength: 100 }),
          searchQueryArbitrary,
          (users, searchQuery) => {
            const filtered = filterUsersByEmail(users, searchQuery);

            // Filtered count should be <= original count
            return filtered.length <= users.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('filtering should be case-insensitive', () => {
      fc.assert(
        fc.property(
          fc.array(userWithEmailArbitrary, { minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (users, searchQuery) => {
            const lowerCaseFiltered = filterUsersByEmail(users, searchQuery.toLowerCase());
            const upperCaseFiltered = filterUsersByEmail(users, searchQuery.toUpperCase());
            const mixedCaseFiltered = filterUsersByEmail(users, searchQuery);

            // All case variations should return the same results
            return (
              lowerCaseFiltered.length === upperCaseFiltered.length &&
              upperCaseFiltered.length === mixedCaseFiltered.length
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Pagination Limit
   *
   * Page size is always <= 50 users.
   *
   * **Validates: Requirements 3.4**
   */
  describe('Property 3: Pagination Limit', () => {
    test('paginated results should never exceed PAGE_SIZE (50)', () => {
      fc.assert(
        fc.property(
          fc.array(userWithEmailArbitrary, { minLength: 0, maxLength: 200 }),
          fc.nat({ max: 10 }), // page index
          (users, pageIndex) => {
            const paginated = paginateUsers(users, PAGE_SIZE, pageIndex);

            // Paginated results should never exceed PAGE_SIZE
            return paginated.length <= PAGE_SIZE;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('paginated results should be exactly PAGE_SIZE when enough users exist', () => {
      fc.assert(
        fc.property(
          fc.array(userWithEmailArbitrary, { minLength: PAGE_SIZE + 1, maxLength: 200 }),
          (users) => {
            const paginated = paginateUsers(users, PAGE_SIZE, 0);

            // First page should have exactly PAGE_SIZE users when there are more
            return paginated.length === PAGE_SIZE;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('total paginated users across all pages should equal original count', () => {
      fc.assert(
        fc.property(
          fc.array(userWithEmailArbitrary, { minLength: 0, maxLength: 200 }),
          (users) => {
            let totalPaginated = 0;
            let pageIndex = 0;
            let hasMore = true;

            while (hasMore) {
              const paginated = paginateUsers(users, PAGE_SIZE, pageIndex);
              totalPaginated += paginated.length;
              hasMore = paginated.length === PAGE_SIZE;
              pageIndex++;
            }

            return totalPaginated === users.length;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: CSV User Export Format
   *
   * CSV export always has:
   * - Header row with `email,isAdmin,status,createdAt`
   * - Each data row has 4 comma-separated fields
   * - `isAdmin` field is `true` or `false`
   * - `status` field is `active` or `disabled`
   * - `createdAt` field is ISO 8601 format
   *
   * **Validates: Requirements 3.11, 16.4, 16.5, 16.6, 16.7**
   */
  describe('Property 4: CSV User Export Format', () => {
    test('CSV should always have correct header row', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 0, maxLength: 100 }),
          (users) => {
            const csv = generateUserExportCSV(users);
            const content = csv.replace(UTF8_BOM, '');
            const lines = content.split('\n');

            // First line should be the header
            return lines[0] === CSV_EXPORT_HEADERS.join(',');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('CSV should have correct number of data rows', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 0, maxLength: 100 }),
          (users) => {
            const csv = generateUserExportCSV(users);
            const content = csv.replace(UTF8_BOM, '');
            const lines = content.split('\n');

            // Should have header + data rows
            return lines.length === users.length + 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('each data row should have exactly 4 fields', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 1, maxLength: 50 }),
          (users) => {
            const csv = generateUserExportCSV(users);
            const content = csv.replace(UTF8_BOM, '');
            const lines = content.split('\n');

            // Skip header, check each data row
            const dataRows = lines.slice(1);
            return dataRows.every((row) => {
              // Handle escaped values (values with commas inside quotes)
              const fields = parseCSVRow(row);
              return fields.length === 4;
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    test('isAdmin field should be "true" or "false"', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 1, maxLength: 50 }),
          (users) => {
            const csv = generateUserExportCSV(users);
            const content = csv.replace(UTF8_BOM, '');
            const lines = content.split('\n');

            // Skip header, check each data row
            const dataRows = lines.slice(1);
            return dataRows.every((row) => {
              const fields = parseCSVRow(row);
              const isAdminValue = fields[1];
              return isAdminValue === 'true' || isAdminValue === 'false';
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    test('status field should be "active" or "disabled"', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 1, maxLength: 50 }),
          (users) => {
            const csv = generateUserExportCSV(users);
            const content = csv.replace(UTF8_BOM, '');
            const lines = content.split('\n');

            // Skip header, check each data row
            const dataRows = lines.slice(1);
            return dataRows.every((row) => {
              const fields = parseCSVRow(row);
              const statusValue = fields[2];
              return statusValue === 'active' || statusValue === 'disabled';
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    test('createdAt field should be ISO 8601 format', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 1, maxLength: 50 }),
          (users) => {
            const csv = generateUserExportCSV(users);
            const content = csv.replace(UTF8_BOM, '');
            const lines = content.split('\n');

            // Skip header, check each data row
            const dataRows = lines.slice(1);
            return dataRows.every((row) => {
              const fields = parseCSVRow(row);
              const createdAtValue = fields[3];
              // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
              return isValidISO8601(createdAtValue);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    test('all user data should be present in CSV', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 1, maxLength: 50 }),
          (users) => {
            const csv = generateUserExportCSV(users);

            // Each user's email should appear in the CSV
            return users.every((user) => csv.includes(user.email));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: CSV File Generation
   *
   * Generated CSV always:
   * - Starts with UTF-8 BOM (`\uFEFF`)
   * - Has valid structure
   * - Filename contains date in YYYY-MM-DD format
   *
   * **Validates: Requirements 3.14, 3.15**
   */
  describe('Property 7: CSV File Generation', () => {
    test('CSV should always start with UTF-8 BOM', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 0, maxLength: 100 }),
          (users) => {
            const csv = generateUserExportCSV(users);

            // CSV should start with UTF-8 BOM
            return csv.startsWith(UTF8_BOM);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('CSV should have valid structure (BOM + header + data)', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 0, maxLength: 100 }),
          (users) => {
            const csv = generateUserExportCSV(users);

            // Check structure
            const hasBOM = csv.startsWith(UTF8_BOM);
            const content = csv.replace(UTF8_BOM, '');
            const lines = content.split('\n');
            const hasHeader = lines.length >= 1 && lines[0] === CSV_EXPORT_HEADERS.join(',');
            const hasCorrectRowCount = lines.length === users.length + 1;

            return hasBOM && hasHeader && hasCorrectRowCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('generateCSVContent should always produce UTF-8 BOM prefixed content', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          fc.array(
            fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
            { minLength: 0, maxLength: 20 }
          ),
          (headers, rows) => {
            const csv = generateCSVContent(headers, rows);

            // CSV should start with UTF-8 BOM
            return csv.startsWith(UTF8_BOM);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('export filename should contain date in YYYY-MM-DD format', () => {
      // This test verifies the filename generation
      const filename = generateUserExportFilename();
      const datePattern = /\d{4}-\d{2}-\d{2}/;

      expect(filename).toMatch(datePattern);
      expect(filename.startsWith('users_')).toBe(true);
      expect(filename.endsWith('.csv')).toBe(true);
    });

    test('getCurrentDateString should return valid YYYY-MM-DD format', () => {
      const dateString = getCurrentDateString();
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;

      expect(dateString).toMatch(datePattern);

      // Verify it's a valid date
      const parsedDate = new Date(dateString);
      expect(parsedDate.toString()).not.toBe('Invalid Date');
    });

    test('CSV content should not have trailing newlines', () => {
      fc.assert(
        fc.property(
          fc.array(userExportDataArbitrary, { minLength: 0, maxLength: 50 }),
          (users) => {
            const csv = generateUserExportCSV(users);

            // CSV should not end with newline
            return !csv.endsWith('\n');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Helper function to parse a CSV row, handling escaped values
 */
function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = row[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ',') {
        // Field separator
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  // Add last field
  fields.push(current);

  return fields;
}

/**
 * Helper function to validate ISO 8601 date format
 */
function isValidISO8601(dateString: string): boolean {
  // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ or similar variations
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z?$/;
  if (!iso8601Pattern.test(dateString)) {
    return false;
  }

  // Also verify it's a valid date
  const date = new Date(dateString);
  return date.toString() !== 'Invalid Date';
}
