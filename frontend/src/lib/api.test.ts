import { describe, it, expect } from 'vitest';
import { parseBatchInput, dateFromNs } from './api';
describe('verification inputs', () => {
  it('reads both printed IDs and QR URLs', () => { expect(parseBatchInput(' farm.testnet:abc ')).toBe('farm.testnet:abc'); expect(parseBatchInput('https://mixit.example/?batch=farm.testnet%3Aabc')).toBe('farm.testnet:abc'); });
  it('rejects unrelated URLs', () => { expect(() => parseBatchInput('https://example.com')).toThrow('batch ID'); });
  it('handles nanosecond strings without number precision loss', () => { expect(dateFromNs('1700000000000000000')).toBe(new Date(1700000000000).toLocaleString()); });
});
