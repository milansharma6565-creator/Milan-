export function normalizePhone(phone?: string | null): string {
  const digits = String(phone ?? '').replace(/\D+/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function parseLedgerDate(input?: string | Date | null): Date | null {
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

export interface CalculateGrandTotalParams {
  quantity: number | string;
  rate: number | string;
  discount?: number | string;
  gstPercent?: number | string;
}

export function calculateGrandTotal({ quantity, rate, discount = 0, gstPercent = 0 }: CalculateGrandTotalParams): number {
  const qty = Math.max(0, Number(quantity) || 0);
  const unitRate = Math.max(0, Number(rate) || 0);
  const disc = Math.max(0, Number(discount) || 0);
  const gst = Math.max(0, Number(gstPercent) || 0);
  const subtotal = Math.round(qty * unitRate * 100) / 100;
  const taxable = Math.max(0, Math.round((subtotal - disc) * 100) / 100);
  const taxAmount = Math.round(taxable * (gst / 100) * 100) / 100;
  return Math.round((taxable + taxAmount) * 100) / 100;
}

export interface LedgerLine {
  accountId?: string;
  amount: number | string;
  type: 'Dr' | 'Cr' | string;
}

export interface ClosingBalanceResult {
  closingBalance: number;
  balanceType: 'Dr' | 'Cr';
  totalDr: number;
  totalCr: number;
}

export function computeAccountClosingBalance(
  openingBalance: number | string,
  openingType: 'Dr' | 'Cr' | string,
  lines: LedgerLine[]
): ClosingBalanceResult {
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

export function chunkOperations<T>(items: T[], chunkSize = 400): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
  return chunks;
}

export async function commitInChunks<T>(
  items: T[],
  commitFn: (chunk: T[]) => Promise<void>,
  chunkSize = 400
): Promise<void> {
  const chunks = chunkOperations(items, chunkSize);
  for (const chunk of chunks) {
    await commitFn(chunk);
  }
}
