/**
 * Property-based tests for statistics and cost Lambda handler.
 *
 * Tests properties:
 * - Property 12: Cost calculation
 * - Property 13: Active user count calculation
 * - Property 14: Total questions calculation
 *
 * Uses fast-check for property-based testing with 100 iterations per test.
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  calculateCost,
  calculateActiveUsers,
  calculateTotalQuestions,
  TokenUsageData,
  MODEL_PRICING,
} from '../../../../lambda/admin/handlers/stats';

describe('Property-Based Tests for Statistics and Cost', () => {
  describe('Property 12: Cost Calculation', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * Property: For any token usage (inputTokens, outputTokens) and modelId:
     * - Calculated cost equals (inputTokens / 1,000,000) * inputRate + (outputTokens / 1,000,000) * outputRate
     * - Cost is non-negative
     */
    it('should calculate cost correctly using the formula', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 10_000_000 }), // inputTokens
          fc.nat({ max: 10_000_000 }), // outputTokens
          fc.constantFrom(...Object.keys(MODEL_PRICING)), // modelId
          (inputTokens, outputTokens, modelId) => {
            const result = calculateCost(inputTokens, outputTokens, modelId);

            // Get pricing for the model
            const pricing = MODEL_PRICING[modelId];

            // Calculate expected cost
            const expectedInputCost =
              (inputTokens / 1_000_000) * pricing.inputPer1M;
            const expectedOutputCost =
              (outputTokens / 1_000_000) * pricing.outputPer1M;
            const expectedTotalCost = expectedInputCost + expectedOutputCost;

            // Verify the formula
            expect(result.inputCost).toBeCloseTo(expectedInputCost, 10);
            expect(result.outputCost).toBeCloseTo(expectedOutputCost, 10);
            expect(result.totalCost).toBeCloseTo(expectedTotalCost, 10);

            // Verify cost is non-negative
            expect(result.inputCost).toBeGreaterThanOrEqual(0);
            expect(result.outputCost).toBeGreaterThanOrEqual(0);
            expect(result.totalCost).toBeGreaterThanOrEqual(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure total cost equals sum of input and output costs', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 10_000_000 }),
          fc.nat({ max: 10_000_000 }),
          fc.constantFrom(...Object.keys(MODEL_PRICING)),
          (inputTokens, outputTokens, modelId) => {
            const result = calculateCost(inputTokens, outputTokens, modelId);

            // Total cost should equal sum of input and output costs
            const sumCost = result.inputCost + result.outputCost;
            expect(result.totalCost).toBeCloseTo(sumCost, 10);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should scale linearly with token count', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 1_000_000 }),
          fc.nat({ max: 1_000_000 }),
          fc.constantFrom(...Object.keys(MODEL_PRICING)),
          fc.integer({ min: 2, max: 10 }), // scaling factor
          (inputTokens, outputTokens, modelId, scaleFactor) => {
            const cost1 = calculateCost(inputTokens, outputTokens, modelId);
            const cost2 = calculateCost(
              inputTokens * scaleFactor,
              outputTokens * scaleFactor,
              modelId
            );

            // Cost should scale linearly
            expect(cost2.totalCost).toBeCloseTo(
              cost1.totalCost * scaleFactor,
              8
            );

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return zero cost for zero tokens', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.keys(MODEL_PRICING)),
          (modelId) => {
            const result = calculateCost(0, 0, modelId);

            expect(result.inputCost).toBe(0);
            expect(result.outputCost).toBe(0);
            expect(result.totalCost).toBe(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 13: Active User Count Calculation', () => {
    /**
     * **Validates: Requirements 7.2**
     *
     * Property: For any list of token usage data:
     * - Active user count equals the number of unique userIds
     * - Count is non-negative
     * - Count is less than or equal to the total number of records
     */
    it('should count unique userIds correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              date: fc.integer({ min: 1, max: 365 }).map((d) => {
                const date = new Date(2025, 0, d);
                return date.toISOString().split('T')[0];
              }),
              userId: fc.string({ minLength: 1, maxLength: 20 }),
              modelId: fc.constantFrom(...Object.keys(MODEL_PRICING)),
              requestCount: fc.nat({ max: 100 }),
              inputTokens: fc.nat({ max: 10000 }),
              outputTokens: fc.nat({ max: 10000 }),
            }),
            { minLength: 0, maxLength: 100 }
          ),
          (usageData) => {
            const result = calculateActiveUsers(usageData);

            // Calculate expected unique users
            const uniqueUsers = new Set(usageData.map((d) => d.userId));
            const expectedCount = uniqueUsers.size;

            // Verify count matches unique userIds
            expect(result).toBe(expectedCount);

            // Verify count is non-negative
            expect(result).toBeGreaterThanOrEqual(0);

            // Verify count is less than or equal to total records
            expect(result).toBeLessThanOrEqual(usageData.length);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 for empty data', () => {
      const result = calculateActiveUsers([]);
      expect(result).toBe(0);
    });

    it('should handle duplicate users correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }), // single userId
          fc.integer({ min: 1, max: 10 }), // number of duplicates
          (userId, duplicateCount) => {
            // Create array with duplicate userIds
            const usageData: TokenUsageData[] = Array(duplicateCount)
              .fill(null)
              .map(() => ({
                date: '2025-01-22',
                userId,
                modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
                requestCount: 1,
                inputTokens: 100,
                outputTokens: 50,
              }));

            const result = calculateActiveUsers(usageData);

            // Should count as 1 unique user
            expect(result).toBe(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 14: Total Questions Calculation', () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * Property: For any list of token usage data:
     * - Total questions equals the sum of all requestCount values
     * - Count is non-negative
     * - Count is greater than or equal to the number of records (assuming each record has at least 1 request)
     */
    it('should sum all request counts correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              date: fc.integer({ min: 1, max: 365 }).map((d) => {
                const date = new Date(2025, 0, d);
                return date.toISOString().split('T')[0];
              }),
              userId: fc.string({ minLength: 1, maxLength: 20 }),
              modelId: fc.constantFrom(...Object.keys(MODEL_PRICING)),
              requestCount: fc.nat({ max: 100 }),
              inputTokens: fc.nat({ max: 10000 }),
              outputTokens: fc.nat({ max: 10000 }),
            }),
            { minLength: 0, maxLength: 100 }
          ),
          (usageData) => {
            const result = calculateTotalQuestions(usageData);

            // Calculate expected sum
            const expectedSum = usageData.reduce(
              (sum, data) => sum + data.requestCount,
              0
            );

            // Verify sum matches
            expect(result).toBe(expectedSum);

            // Verify count is non-negative
            expect(result).toBeGreaterThanOrEqual(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 for empty data', () => {
      const result = calculateTotalQuestions([]);
      expect(result).toBe(0);
    });

    it('should handle single record correctly', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 1000 }), // requestCount
          (requestCount) => {
            const usageData: TokenUsageData[] = [
              {
                date: '2025-01-22',
                userId: 'user1',
                modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
                requestCount,
                inputTokens: 100,
                outputTokens: 50,
              },
            ];

            const result = calculateTotalQuestions(usageData);

            expect(result).toBe(requestCount);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be commutative (order does not matter)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              date: fc.integer({ min: 1, max: 365 }).map((d) => {
                const date = new Date(2025, 0, d);
                return date.toISOString().split('T')[0];
              }),
              userId: fc.string({ minLength: 1, maxLength: 20 }),
              modelId: fc.constantFrom(...Object.keys(MODEL_PRICING)),
              requestCount: fc.nat({ max: 100 }),
              inputTokens: fc.nat({ max: 10000 }),
              outputTokens: fc.nat({ max: 10000 }),
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (usageData) => {
            const result1 = calculateTotalQuestions(usageData);

            // Shuffle the array
            const shuffled = [...usageData].sort(() => Math.random() - 0.5);
            const result2 = calculateTotalQuestions(shuffled);

            // Results should be the same regardless of order
            expect(result1).toBe(result2);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be additive (splitting data should give same result)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              date: fc.integer({ min: 1, max: 365 }).map((d) => {
                const date = new Date(2025, 0, d);
                return date.toISOString().split('T')[0];
              }),
              userId: fc.string({ minLength: 1, maxLength: 20 }),
              modelId: fc.constantFrom(...Object.keys(MODEL_PRICING)),
              requestCount: fc.nat({ max: 100 }),
              inputTokens: fc.nat({ max: 10000 }),
              outputTokens: fc.nat({ max: 10000 }),
            }),
            { minLength: 2, maxLength: 50 }
          ),
          (usageData) => {
            const totalAll = calculateTotalQuestions(usageData);

            // Split data in half
            const mid = Math.floor(usageData.length / 2);
            const part1 = usageData.slice(0, mid);
            const part2 = usageData.slice(mid);

            const totalPart1 = calculateTotalQuestions(part1);
            const totalPart2 = calculateTotalQuestions(part2);

            // Sum of parts should equal total
            expect(totalPart1 + totalPart2).toBe(totalAll);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Combined Properties', () => {
    it('should maintain consistency between active users and total questions', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              date: fc.integer({ min: 1, max: 365 }).map((d) => {
                const date = new Date(2025, 0, d);
                return date.toISOString().split('T')[0];
              }),
              userId: fc.string({ minLength: 1, maxLength: 20 }),
              modelId: fc.constantFrom(...Object.keys(MODEL_PRICING)),
              requestCount: fc.integer({ min: 1, max: 100 }), // At least 1 request
              inputTokens: fc.nat({ max: 10000 }),
              outputTokens: fc.nat({ max: 10000 }),
            }),
            { minLength: 1, maxLength: 100 }
          ),
          (usageData) => {
            const activeUsers = calculateActiveUsers(usageData);
            const totalQuestions = calculateTotalQuestions(usageData);

            // If there are active users, there must be questions
            if (activeUsers > 0) {
              expect(totalQuestions).toBeGreaterThan(0);
            }

            // Total questions should be at least equal to active users
            // (assuming each user has at least 1 request)
            expect(totalQuestions).toBeGreaterThanOrEqual(activeUsers);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
