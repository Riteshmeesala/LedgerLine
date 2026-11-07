/**
 * Money utilities using integer/BigInt minor units (paise) math exclusively.
 * Floating point arithmetic is strictly avoided to prevent rounding and precision errors.
 */

export function formatINR(minorUnits) {
  if (minorUnits === null || minorUnits === undefined || minorUnits === '') {
    return '₹0.00';
  }

  let big;
  try {
    if (typeof minorUnits === 'bigint') {
      big = minorUnits;
    } else {
      big = BigInt(Math.trunc(Number(minorUnits)));
    }
  } catch (e) {
    return '₹0.00';
  }

  const isNegative = big < 0n;
  const absBig = isNegative ? -big : big;
  const rupees = absBig / 100n;
  const paise = absBig % 100n;
  const formattedRupees = rupees.toLocaleString('en-IN');
  const formattedPaise = paise.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}₹${formattedRupees}.${formattedPaise}`;
}

export function parseINRToMinorUnits(rupeeString) {
  if (!rupeeString) return 0n;
  const cleaned = rupeeString.toString().replace(/[^0-9.]/g, '');
  if (!cleaned) return 0n;

  const parts = cleaned.split('.');
  const wholePart = BigInt(parts[0] || '0');
  let fractionPartStr = (parts[1] || '').slice(0, 2);
  while (fractionPartStr.length < 2) {
    fractionPartStr += '0';
  }
  const fractionPart = BigInt(fractionPartStr);

  return wholePart * 100n + fractionPart;
}

