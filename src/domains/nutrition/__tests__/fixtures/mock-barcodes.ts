/**
 * Mock barcode test data
 * Covers valid/invalid formats for barcode validation tests
 */

export const validBarcodes = {
  ean13: '5449000000996', // Coca-Cola (13 digits)
  upcA: '012345678905', // Generic UPC-A (12 digits)
  ean8: '12345670', // Short format (8 digits)
}

export const invalidBarcodes = {
  tooShort: '1234567', // Only 7 digits
  tooLong: '12345678901234', // 14 digits
  nonNumeric: 'ABC123XYZ', // Letters
  empty: '',
  whitespace: '  ',
  specialChars: '123-456-789',
}

export const edgeCaseBarcodes = {
  leadingZeros: '0000000000123', // Valid EAN-13 with leading zeros
  allZeros: '0000000000000', // Edge case
}
