import { describe, it, expect } from 'vitest';
import { formatINR, parseINRToMinorUnits } from '../utils/money';

describe('Money Utilities (Strict Integer / Minor Units Math)', () => {
  it('formats zero minor units correctly as INR', () => {
    expect(formatINR(0)).toBe('₹0.00');
    expect(formatINR(0n)).toBe('₹0.00');
    expect(formatINR(null)).toBe('₹0.00');
  });

  it('formats positive minor units into standard Indian Numbering System', () => {
    expect(formatINR(100)).toBe('₹1.00');
    expect(formatINR(10050)).toBe('₹100.50');
    expect(formatINR(100000)).toBe('₹1,000.00');
    expect(formatINR(10000000n)).toBe('₹1,00,000.00'); // 1 Lakh rupees
    expect(formatINR(1000000000n)).toBe('₹1,00,00,000.00'); // 1 Crore rupees
  });

  it('formats negative minor units (debits/outflows) with leading minus', () => {
    expect(formatINR(-5000)).toBe('-₹50.00');
    expect(formatINR(-100000n)).toBe('-₹1,000.00');
  });

  it('parses rupee strings cleanly into minor unit BigInts', () => {
    expect(parseINRToMinorUnits('1')).toBe(100n);
    expect(parseINRToMinorUnits('100.50')).toBe(10050n);
    expect(parseINRToMinorUnits('1,000.05')).toBe(100005n);
    expect(parseINRToMinorUnits('0.01')).toBe(1n);
    expect(parseINRToMinorUnits('')).toBe(0n);
  });

  it('never produces floating point rounding errors', () => {
    // In IEEE 754 float: 0.1 + 0.2 = 0.30000000000000004
    // In minor units (paise): 10n + 20n = 30n -> ₹0.30 exactly
    const tenPaise = parseINRToMinorUnits('0.10');
    const twentyPaise = parseINRToMinorUnits('0.20');
    const sum = tenPaise + twentyPaise;
    expect(sum).toBe(30n);
    expect(formatINR(sum)).toBe('₹0.30');
  });
});

