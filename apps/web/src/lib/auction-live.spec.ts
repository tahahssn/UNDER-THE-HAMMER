import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  resolveCurrency,
  normalizeBidError,
  generateIdempotencyKey,
} from './auction-live';

describe('formatMoney', () => {
  it('formats crore, lakh and sub-lakh amounts with a currency prefix', () => {
    expect(formatMoney(1_500_000_000, 'PKR')).toBe('PKR 1.50 Cr'); // 1.5 Cr
    expect(formatMoney(200_000_000, 'PKR')).toBe('PKR 20.00 L'); // 20 L
    expect(formatMoney(100_000, 'PKR')).toBe('PKR 1,000'); // 1,000 rupees
  });

  it('defaults to PKR and treats non-finite input as zero', () => {
    expect(formatMoney(500_00)).toContain('PKR');
    expect(formatMoney(Number.NaN)).toBe('PKR 0');
  });
});

describe('resolveCurrency', () => {
  it('returns the provided currency or falls back to PKR', () => {
    expect(resolveCurrency('USD')).toBe('USD');
    expect(resolveCurrency('')).toBe('PKR');
    expect(resolveCurrency(undefined)).toBe('PKR');
  });
});

describe('normalizeBidError', () => {
  it('maps a raw string rejection code', () => {
    expect(normalizeBidError('BELOW_MINIMUM').code).toBe('INVALID_INCREMENT');
    expect(normalizeBidError('DEADLINE_PASSED').code).toBe('BID_AFTER_DEADLINE');
  });

  it('maps Phase G internal codes onto UI codes with details', () => {
    const err = normalizeBidError({
      reason: 'PLAYER_ALREADY_SOLD',
      message: 'gone',
      available: 10,
      currency: 'PKR',
    });
    expect(err.code).toBe('PLAYER_SOLD');
    expect(err.message).toBe('gone');
    expect(err.availableMinor).toBe(10);
  });

  it('passes through already-normalized codes and preserves minimumBid', () => {
    const err = normalizeBidError({ code: 'INVALID_INCREMENT', minimumBid: 42 });
    expect(err.code).toBe('INVALID_INCREMENT');
    expect(err.minimumBidMinor).toBe(42);
  });

  it('returns UNKNOWN for unrecognized shapes', () => {
    expect(normalizeBidError(null).code).toBe('UNKNOWN');
    expect(normalizeBidError(123 as unknown).code).toBe('UNKNOWN');
  });
});

describe('generateIdempotencyKey', () => {
  it('produces unique non-empty keys', () => {
    const a = generateIdempotencyKey();
    const b = generateIdempotencyKey();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
