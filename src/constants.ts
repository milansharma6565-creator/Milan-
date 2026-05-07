export const TANKER_SIZES = [
  { label: '5000L', value: '5000', defaultRate: 400 },
  { label: '7500L', value: '7500', defaultRate: 600 },
  { label: '10000L', value: '10000', defaultRate: 800 },
  { label: '15000L', value: '15000', defaultRate: 1200 },
];

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Pending', 'Split'] as const;
export const BILL_STATUSES = ['Delivered', 'Pending', 'Cancelled'] as const;

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function generateBillNumber(sequence: number = 1) {
  return sequence.toString().padStart(5, '0');
}
