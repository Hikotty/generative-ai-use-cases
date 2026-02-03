/**
 * Property-based tests for RAG document management Lambda handler.
 *
 * Tests properties:
 * - Property 17: Sync job UI state management
 * - Property 18: File size validation
 *
 * Uses fast-check for property-based testing with 100 iterations per test.
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  validateFileSize,
  shouldDisableButtons,
  getFileExtension,
  isSupportedExtension,
  isTextDocument,
  isImageFile,
  filterDocumentsByName,
  TEXT_DOCUMENT_EXTENSIONS,
  IMAGE_FILE_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
  MAX_TEXT_DOCUMENT_SIZE,
  MAX_IMAGE_FILE_SIZE,
} from '../../../../lambda/admin/handlers/rag';

describe('Property-Based Tests for RAG Document Management', () => {
  describe('Property 17: Sync Job UI State Management', () => {
    /**
     * **Validates: Requirements 20.2, 20.3**
     *
     * Property: For any sync job status:
     * - Status 'IN_PROGRESS' → buttons should be disabled
     * - Status 'COMPLETE', 'FAILED', or undefined → buttons should be enabled
     */
    it('should disable buttons only for IN_PROGRESS or STARTING status', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'IN_PROGRESS',
            'STARTING',
            'COMPLETE',
            'FAILED',
            'STOPPED',
            undefined,
            ''
          ),
          (status) => {
            const shouldDisable = shouldDisableButtons(status);

            if (status === 'IN_PROGRESS' || status === 'STARTING') {
              expect(shouldDisable).toBe(true);
            } else {
              expect(shouldDisable).toBe(false);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return boolean for any string status', () => {
      fc.assert(
        fc.property(fc.string(), (status) => {
          const result = shouldDisableButtons(status);
          expect(typeof result).toBe('boolean');
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should be consistent for repeated calls with same status', () => {
      fc.assert(
        fc.property(fc.option(fc.string(), { nil: undefined }), (status) => {
          const result1 = shouldDisableButtons(status);
          const result2 = shouldDisableButtons(status);
          expect(result1).toBe(result2);
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 18: File Size Validation', () => {
    /**
     * **Validates: Requirements 20.8, 20.9**
     *
     * Property: For any file and file type:
     * - Text documents (.txt, .md, .html, .doc, .docx, .csv, .xls, .xlsx, .pdf): detect >50MB
     * - Image files (.jpeg, .png): detect >3.75MB
     * - Return appropriate error message on validation failure
     */
    it('should accept text documents within 50MB limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: MAX_TEXT_DOCUMENT_SIZE }),
          fc.constantFrom(...TEXT_DOCUMENT_EXTENSIONS),
          (fileSize, extension) => {
            const result = validateFileSize(fileSize, extension);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject text documents exceeding 50MB', () => {
      fc.assert(
        fc.property(
          fc.integer({
            min: MAX_TEXT_DOCUMENT_SIZE + 1,
            max: MAX_TEXT_DOCUMENT_SIZE * 2,
          }),
          fc.constantFrom(...TEXT_DOCUMENT_EXTENSIONS),
          (fileSize, extension) => {
            const result = validateFileSize(fileSize, extension);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('50MB');
            expect(result.maxSize).toBe(MAX_TEXT_DOCUMENT_SIZE);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept image files within 3.75MB limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: Math.floor(MAX_IMAGE_FILE_SIZE) }),
          fc.constantFrom(...IMAGE_FILE_EXTENSIONS),
          (fileSize, extension) => {
            const result = validateFileSize(fileSize, extension);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject image files exceeding 3.75MB', () => {
      fc.assert(
        fc.property(
          fc.integer({
            min: Math.ceil(MAX_IMAGE_FILE_SIZE) + 1,
            max: Math.ceil(MAX_IMAGE_FILE_SIZE) * 2,
          }),
          fc.constantFrom(...IMAGE_FILE_EXTENSIONS),
          (fileSize, extension) => {
            const result = validateFileSize(fileSize, extension);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('3.75MB');
            expect(result.maxSize).toBe(MAX_IMAGE_FILE_SIZE);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject zero or negative file sizes for any extension', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000000, max: 0 }),
          fc.constantFrom(...SUPPORTED_EXTENSIONS),
          (fileSize, extension) => {
            const result = validateFileSize(fileSize, extension);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept files at exactly the maximum size', () => {
      // Text documents at exactly 50MB
      TEXT_DOCUMENT_EXTENSIONS.forEach((ext) => {
        const result = validateFileSize(MAX_TEXT_DOCUMENT_SIZE, ext);
        expect(result.valid).toBe(true);
      });

      // Image files at exactly 3.75MB
      IMAGE_FILE_EXTENSIONS.forEach((ext) => {
        const result = validateFileSize(MAX_IMAGE_FILE_SIZE, ext);
        expect(result.valid).toBe(true);
      });
    });

    it('should apply correct size limit based on file type', () => {
      fc.assert(
        fc.property(fc.constantFrom(...SUPPORTED_EXTENSIONS), (extension) => {
          // Test with a size that's valid for text but invalid for images
          const testSize = Math.floor(MAX_IMAGE_FILE_SIZE) + 1000;

          const result = validateFileSize(testSize, extension);

          if (isTextDocument(extension)) {
            // Should be valid for text documents (well under 50MB)
            expect(result.valid).toBe(true);
          } else if (isImageFile(extension)) {
            // Should be invalid for images (over 3.75MB)
            expect(result.valid).toBe(false);
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('File Extension Utilities Properties', () => {
    it('should extract extension consistently', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom(...SUPPORTED_EXTENSIONS),
          (baseName, extension) => {
            const fileName = `${baseName}${extension}`;
            const extracted = getFileExtension(fileName);
            expect(extracted).toBe(extension.toLowerCase());
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify supported extensions', () => {
      fc.assert(
        fc.property(fc.constantFrom(...SUPPORTED_EXTENSIONS), (extension) => {
          expect(isSupportedExtension(extension)).toBe(true);
          expect(isSupportedExtension(extension.toUpperCase())).toBe(true);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly categorize text vs image extensions', () => {
      fc.assert(
        fc.property(fc.constantFrom(...SUPPORTED_EXTENSIONS), (extension) => {
          const isText = isTextDocument(extension);
          const isImage = isImageFile(extension);

          // Should be exactly one of text or image
          expect(isText !== isImage).toBe(true);

          // Verify categorization
          if (TEXT_DOCUMENT_EXTENSIONS.includes(extension)) {
            expect(isText).toBe(true);
            expect(isImage).toBe(false);
          } else {
            expect(isText).toBe(false);
            expect(isImage).toBe(true);
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Document Filtering Properties', () => {
    // Generator for document entries - using a simple ISO string generator
    const isoDateArb = fc
      .integer({ min: 2020, max: 2030 })
      .chain((year) =>
        fc
          .integer({ min: 1, max: 12 })
          .chain((month) =>
            fc
              .integer({ min: 1, max: 28 })
              .map(
                (day) =>
                  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`
              )
          )
      );

    const documentEntryArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      fileName: fc.string({ minLength: 1, maxLength: 50 }),
      size: fc.nat({ max: 100000000 }),
      uploadedAt: isoDateArb,
      extension: fc.constantFrom(...SUPPORTED_EXTENSIONS),
    });

    it('should return all documents when search keyword is empty', () => {
      fc.assert(
        fc.property(
          fc.array(documentEntryArb, { minLength: 0, maxLength: 50 }),
          fc.constantFrom('', '   ', null, undefined),
          (documents, keyword) => {
            const result = filterDocumentsByName(documents, keyword || '');
            expect(result.length).toBe(documents.length);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return subset of documents when filtering', () => {
      fc.assert(
        fc.property(
          fc.array(documentEntryArb, { minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (documents, keyword) => {
            const result = filterDocumentsByName(documents, keyword);
            expect(result.length).toBeLessThanOrEqual(documents.length);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only return documents containing the search keyword', () => {
      fc.assert(
        fc.property(
          fc.array(documentEntryArb, { minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (documents, keyword) => {
            const result = filterDocumentsByName(documents, keyword);

            // All returned documents should contain the keyword (case-insensitive)
            const lowerKeyword = keyword.toLowerCase();
            result.forEach((doc) => {
              expect(doc.fileName.toLowerCase()).toContain(lowerKeyword);
            });

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be case-insensitive', () => {
      fc.assert(
        fc.property(
          fc.array(documentEntryArb, { minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (documents, keyword) => {
            const resultLower = filterDocumentsByName(
              documents,
              keyword.toLowerCase()
            );
            const resultUpper = filterDocumentsByName(
              documents,
              keyword.toUpperCase()
            );

            expect(resultLower.length).toBe(resultUpper.length);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be idempotent (filtering twice gives same result)', () => {
      fc.assert(
        fc.property(
          fc.array(documentEntryArb, { minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (documents, keyword) => {
            const result1 = filterDocumentsByName(documents, keyword);
            const result2 = filterDocumentsByName(result1, keyword);

            expect(result1.length).toBe(result2.length);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Combined Properties', () => {
    it('should maintain consistency between file type detection and size validation', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SUPPORTED_EXTENSIONS),
          fc.integer({ min: 1, max: MAX_TEXT_DOCUMENT_SIZE }),
          (extension, fileSize) => {
            const isText = isTextDocument(extension);
            const isImage = isImageFile(extension);
            const validation = validateFileSize(fileSize, extension);

            // If file is valid, it should be within the appropriate limit
            if (validation.valid) {
              if (isText) {
                expect(fileSize).toBeLessThanOrEqual(MAX_TEXT_DOCUMENT_SIZE);
              }
              if (isImage) {
                expect(fileSize).toBeLessThanOrEqual(MAX_IMAGE_FILE_SIZE);
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify all supported extensions as either text or image', () => {
      SUPPORTED_EXTENSIONS.forEach((ext) => {
        const isText = isTextDocument(ext);
        const isImage = isImageFile(ext);

        // Each extension should be exactly one type
        expect(isText || isImage).toBe(true);
        expect(isText && isImage).toBe(false);
      });
    });
  });
});
