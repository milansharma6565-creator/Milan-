import test from 'node:test';
import assert from 'node:assert/strict';

function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D+/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function parseLedgerDate(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const trimmed = String(input).trim();
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00+05:30`);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const ymdMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (ymdMatch) {
    const [, yyyy, mm, dd] = ymdMatch;
    const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00+05:30`);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function calculateGrandTotal({ quantity, rate, discount = 0, gstPercent = 0 }) {
  const qty = Math.max(0, Number(quantity) || 0);
  const unitRate = Math.max(0, Number(rate) || 0);
  const disc = Math.max(0, Number(discount) || 0);
  const gst = Math.max(0, Number(gstPercent) || 0);
  const subtotal = Math.round(qty * unitRate * 100) / 100;
  const taxable = Math.max(0, Math.round((subtotal - disc) * 100) / 100);
  const taxAmount = Math.round(taxable * (gst / 100) * 100) / 100;
  return Math.round((taxable + taxAmount) * 100) / 100;
}

function computeAccountClosingBalance(openingBalance, openingType, lines) {
  const signedOpening = Math.abs(Number(openingBalance) || 0) * (openingType === 'Dr' ? 1 : -1);
  let totalDr = 0;
  let totalCr = 0;
  for (const line of lines) {
    const amt = Math.max(0, Number(line.amount) || 0);
    if (line.type === 'Dr') totalDr += amt;
    else totalCr += amt;
  }
  totalDr = Math.round(totalDr * 100) / 100;
  totalCr = Math.round(totalCr * 100) / 100;
  const net = Math.round((signedOpening + totalDr - totalCr) * 100) / 100;
  return { closingBalance: Math.abs(net), balanceType: net >= 0 ? 'Dr' : 'Cr', totalDr, totalCr };
}

function chunkOperations(items, chunkSize = 400) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
  return chunks;
}

test('normalizePhone strips +91, 0 prefixes, and formatting characters', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '9876543210');
  assert.equal(normalizePhone('09876543210'), '9876543210');
});

test('parseLedgerDate handles DD-MM-YYYY and YYYY-MM-DD in IST', () => {
  assert.equal(parseLedgerDate('09-08-2026').getTime(), parseLedgerDate('2026-08-09').getTime());
});

test('calculateGrandTotal rounds decimal rates, discounts, and GST to paise', () => {
  assert.equal(calculateGrandTotal({ quantity: 3, rate: 450.5, discount: 51.5, gstPercent: 18 }), 1534);
});

test('computeAccountClosingBalance tracks Dr/Cr transitions accurately', () => {
  const res = computeAccountClosingBalance(1000, 'Dr', [
    { accountId: 'c1', amount: 500, type: 'Dr' },
    { accountId: 'c1', amount: 1800, type: 'Cr' },
  ]);
  assert.equal(res.closingBalance, 300);
  assert.equal(res.balanceType, 'Cr');
});

test('chunkOperations splits 950 operations into <=400 batches', () => {
  assert.equal(chunkOperations(Array.from({ length: 950 }), 400).length, 3);
});
