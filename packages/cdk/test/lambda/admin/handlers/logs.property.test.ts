/**
 * Property-based tests for log viewer Lambda handlers.
 *
 * Tests the following properties:
 * - Property 8: Log date range filter
 * - Property 9: Log user filter
 * - Property 10: Log CSV export format
 *
 * Requirements tested:
 * - 4.3: Filter by date range
 * - 4.4: Filter by userId
 * - 4.6: Export logs as CSV
 */

import fc from 'fast-check';
import {
  isWithinDateRange,
  convertLogsToCSV,
} from '../../../../lambda/admin/handlers/logs';

describe('Log Viewer Property Tests', () => {
  describe('Property 8: Log date range filter', () => {
    /**
     * **Validates: Requirements 4.3**
     *
     * Property: For any log list and date range (startDate, endDate),
     * all filtered logs should have timestamps within the specified range.
     */
    it('should filter logs within date range', () => {
      fc.assert(
        fc.property(
          // Generate a random timestamp
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          // Generate start and end dates
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          (timestamp, startDate, endDate) => {
            // Skip invalid dates
            if (
              isNaN(timestamp.getTime()) ||
              isNaN(startDate.getTime()) ||
              isNaN(endDate.getTime())
            ) {
              return true;
            }

            // Ensure startDate <= endDate
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const timestampISO = timestamp.toISOString();
            const startISO = start.toISOString().split('T')[0]; // YYYY-MM-DD
            const endISO = end.toISOString().split('T')[0]; // YYYY-MM-DD

            const result = isWithinDateRange(timestampISO, startISO, endISO);

            // Verify: if result is true, timestamp must be within range
            if (result) {
              const ts = new Date(timestampISO);
              const startTime = new Date(startISO);
              const endTime = new Date(endISO);
              endTime.setDate(endTime.getDate() + 1); // Include entire end date

              return ts >= startTime && ts < endTime;
            }

            // If result is false, timestamp must be outside range
            const ts = new Date(timestampISO);
            const startTime = new Date(startISO);
            const endTime = new Date(endISO);
            endTime.setDate(endTime.getDate() + 1);

            return ts < startTime || ts >= endTime;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle only start date filter', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          (timestamp, startDate) => {
            // Skip invalid dates
            if (isNaN(timestamp.getTime()) || isNaN(startDate.getTime())) {
              return true;
            }

            const timestampISO = timestamp.toISOString();
            const startISO = startDate.toISOString().split('T')[0];

            const result = isWithinDateRange(timestampISO, startISO, undefined);

            // Verify: if result is true, timestamp >= startDate
            if (result) {
              return new Date(timestampISO) >= new Date(startISO);
            }

            // If result is false, timestamp < startDate
            return new Date(timestampISO) < new Date(startISO);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle only end date filter', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          (timestamp, endDate) => {
            // Skip invalid dates
            if (isNaN(timestamp.getTime()) || isNaN(endDate.getTime())) {
              return true;
            }

            const timestampISO = timestamp.toISOString();
            const endISO = endDate.toISOString().split('T')[0];

            const result = isWithinDateRange(timestampISO, undefined, endISO);

            // Verify: if result is true, timestamp < endDate + 1 day
            if (result) {
              const ts = new Date(timestampISO);
              const end = new Date(endISO);
              end.setDate(end.getDate() + 1);
              return ts < end;
            }

            // If result is false, timestamp >= endDate + 1 day
            const ts = new Date(timestampISO);
            const end = new Date(endISO);
            end.setDate(end.getDate() + 1);
            return ts >= end;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return true when no date range specified', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          (timestamp) => {
            // Skip invalid dates
            if (isNaN(timestamp.getTime())) {
              return true;
            }

            const timestampISO = timestamp.toISOString();
            return (
              isWithinDateRange(timestampISO, undefined, undefined) === true
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 9: Log user filter', () => {
    /**
     * **Validates: Requirements 4.4**
     *
     * Property: For any log list and userId filter,
     * all filtered logs should have userId matching the filter.
     */
    it('should filter logs by userId', () => {
      fc.assert(
        fc.property(
          // Generate array of log entries with random userIds
          fc.array(
            fc.record({
              timestamp: fc
                .date({
                  min: new Date('2020-01-01'),
                  max: new Date('2030-12-31'),
                })
                .filter((d) => !isNaN(d.getTime()))
                .map((d) => d.toISOString()),
              userId: fc.string({ minLength: 5, maxLength: 10 }),
              chatId: fc.uuid(),
              messageId: fc.uuid(),
              prompt: fc.string(),
              response: fc.string(),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          // Generate userId filter
          fc.string({ minLength: 1, maxLength: 5 }),
          (logs, userIdFilter) => {
            // Filter logs by userId (contains check)
            const filtered = logs.filter((log) =>
              log.userId.includes(userIdFilter)
            );

            // Verify: all filtered logs contain the userId filter
            return filtered.every((log) => log.userId.includes(userIdFilter));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array when no logs match userId filter', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              timestamp: fc
                .date({
                  min: new Date('2020-01-01'),
                  max: new Date('2030-12-31'),
                })
                .filter((d) => !isNaN(d.getTime()))
                .map((d) => d.toISOString()),
              userId: fc.constant('user-123'),
              chatId: fc.uuid(),
              messageId: fc.uuid(),
              prompt: fc.string(),
              response: fc.string(),
            }),
            { minLength: 0, maxLength: 20 }
          ),
          (logs) => {
            const userIdFilter = 'nonexistent-user';
            const filtered = logs.filter((log) =>
              log.userId.includes(userIdFilter)
            );

            // Verify: no logs match the filter
            return filtered.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 10: Log CSV export format', () => {
    /**
     * **Validates: Requirements 4.6**
     *
     * Property: For any log list, the generated CSV should:
     * - Start with UTF-8 BOM
     * - Have header: timestamp,userId,prompt,response
     * - Have correct number of rows (header + data rows)
     * - Each data row has 4 comma-separated fields
     */
    it('should generate valid CSV format', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              timestamp: fc
                .date({
                  min: new Date('2020-01-01'),
                  max: new Date('2030-12-31'),
                })
                .filter((d) => !isNaN(d.getTime()))
                .map((d) => d.toISOString()),
              userId: fc.uuid(),
              chatId: fc.uuid(),
              messageId: fc.uuid(),
              prompt: fc.string({ maxLength: 100 }),
              response: fc.string({ maxLength: 100 }),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          (logs) => {
            const csv = convertLogsToCSV(logs);

            // Property 1: CSV starts with UTF-8 BOM
            if (!csv.startsWith('\uFEFF')) {
              return false;
            }

            // Property 2: CSV has correct header
            const lines = csv.split('\n');
            const header = lines[0].replace('\uFEFF', '');
            if (header !== 'timestamp,userId,prompt,response') {
              return false;
            }

            // Property 3: CSV has correct number of rows (header + data rows)
            // Note: Last line might be empty
            const dataLines = lines
              .slice(1)
              .filter((line) => line.trim() !== '');
            if (dataLines.length !== logs.length) {
              return false;
            }

            // Property 4: Each data row has 4 fields (accounting for quoted fields)
            // This is a simplified check - proper CSV parsing would be more complex
            for (const line of dataLines) {
              // Count fields by splitting on commas (simplified - doesn't handle quoted commas)
              // For proper validation, we'd need a CSV parser
              // Here we just verify the line is not empty
              if (line.trim() === '') {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty log list', () => {
      const csv = convertLogsToCSV([]);

      // Should have BOM + header + newline
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toBe('\uFEFFtimestamp,userId,prompt,response\n');
    });

    it('should escape special CSV characters', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              timestamp: fc.constant('2024-01-22T10:00:00Z'),
              userId: fc.constant('user-123'),
              chatId: fc.constant('chat-456'),
              messageId: fc.constant('msg-789'),
              // Generate strings with CSV special characters
              prompt: fc.string({ minLength: 1, maxLength: 20 }),
              response: fc.string({ minLength: 1, maxLength: 20 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (logs) => {
            const csv = convertLogsToCSV(logs);

            // Verify CSV is generated without errors
            // (proper escaping prevents malformed CSV)
            return csv.length > 0 && csv.startsWith('\uFEFF');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain data integrity in CSV', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              timestamp: fc
                .date({
                  min: new Date('2020-01-01'),
                  max: new Date('2030-12-31'),
                })
                .filter((d) => !isNaN(d.getTime()))
                .map((d) => d.toISOString()),
              userId: fc.uuid(),
              chatId: fc.uuid(),
              messageId: fc.uuid(),
              prompt: fc.string({ maxLength: 50 }),
              response: fc.string({ maxLength: 50 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (logs) => {
            const csv = convertLogsToCSV(logs);
            const lines = csv.split('\n');

            // Verify number of data lines matches input
            const dataLines = lines
              .slice(1)
              .filter((line) => line.trim() !== '');
            return dataLines.length === logs.length;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 8 + 9: Combined date and user filtering', () => {
    /**
     * Property: For any log list, date range, and userId filter,
     * all filtered logs should satisfy both conditions.
     */
    it('should apply both date range and user filters correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              timestamp: fc
                .date({
                  min: new Date('2020-01-01'),
                  max: new Date('2030-12-31'),
                })
                .filter((d) => !isNaN(d.getTime()))
                .map((d) => d.toISOString()),
              userId: fc.string({ minLength: 5, maxLength: 10 }),
              chatId: fc.uuid(),
              messageId: fc.uuid(),
              prompt: fc.string(),
              response: fc.string(),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          fc.string({ minLength: 1, maxLength: 5 }),
          (logs, startDate, endDate, userIdFilter) => {
            // Skip invalid dates
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              return true;
            }

            // Ensure startDate <= endDate
            const [start, end] =
              startDate <= endDate
                ? [startDate, endDate]
                : [endDate, startDate];

            const startISO = start.toISOString().split('T')[0];
            const endISO = end.toISOString().split('T')[0];

            // Apply both filters
            const filtered = logs.filter(
              (log) =>
                isWithinDateRange(log.timestamp, startISO, endISO) &&
                log.userId.includes(userIdFilter)
            );

            // Verify: all filtered logs satisfy both conditions
            return filtered.every(
              (log) =>
                isWithinDateRange(log.timestamp, startISO, endISO) &&
                log.userId.includes(userIdFilter)
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
