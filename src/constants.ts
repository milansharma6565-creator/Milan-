export const PRODUCT_CATEGORIES = [
  { label: 'Water Tanker (Trip)', value: 'TANKER' },
  { label: 'Standby Tanker (Daily)', value: 'STANDBY_TANKER' },
  { label: 'Monthly Tanker', value: 'MONTHLY_TANKER' },
  { label: 'Monthly RO Can', value: 'MONTHLY_CAN' },
  { label: 'Packaged Bottle', value: 'BOTTLE' },
  { label: '20L Water Can', value: 'CAN' },
] as const;

export const BOTTLE_SIZES = [
  { label: '500ml', value: '500ml', defaultRate: 10 },
  { label: '1 Litre', value: '1L', defaultRate: 20 },
  { label: '2 Litre', value: '2L', defaultRate: 35 },
] as const;

export const TANKER_SIZES = [
  { label: '5000L', value: '5000', defaultRate: 400 },
  { label: '7500L', value: '7500', defaultRate: 600 },
  { label: '10000L', value: '10000', defaultRate: 800 },
  { label: '15000L', value: '15000', defaultRate: 1200 },
];

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Pending', 'Split'] as const;
export const BILL_STATUSES = ['Delivered', 'Pending', 'Cancelled'] as const;

export function formatCurrency(amount: number) {
  try {
    const num = Number(amount) || 0;
    const hasDecimals = num % 1 !== 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(num);
  } catch (e) {
    const num = Number(amount) || 0;
    const hasDecimals = num % 1 !== 0;
    return `₹${num.toLocaleString('en-IN', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function generateBillNumber(sequence: number = 1) {
  return sequence.toString().padStart(5, '0');
}

/**
 * Calculates the next unique 5-digit formatted bill number given existing bills.
 * Avoids duplicate and inconsistent sequence scanning across components.
 */
export function getNextBillNumber(existingBills: { billNumber?: string }[] = []): string {
  let highestNum = 0;
  for (const b of existingBills) {
    if (!b || !b.billNumber) continue;
    const cleanStr = String(b.billNumber).replace(/\D/g, '');
    const parsed = parseInt(cleanStr, 10);
    if (!isNaN(parsed) && parsed > highestNum) {
      highestNum = parsed;
    }
  }
  return generateBillNumber(highestNum + 1);
}

export function getPublicAppUrl() {
  const currentUrl = window.location.href;
  try {
    if (currentUrl.includes('ais-dev-')) {
      // Replace ais-dev- with ais-pre- so shared links work for external users
      // who are not authenticated into the project owner's AI studio account.
      const urlObj = new URL(currentUrl.replace('ais-dev-', 'ais-pre-'));
      return urlObj;
    }
    return new URL(currentUrl);
  } catch (e) {
    console.error('URL constructor failed:', e instanceof Error ? e.message : String(e));
    // Fallback to basic link building if URL constructor fails
    return {
      searchParams: {
        set: (k: string, v: string) => {},
        get: (k: string) => null,
        delete: (k: string) => {},
      },
      toString: () => currentUrl,
      href: currentUrl
    } as any;
  }
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed"; 
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (!successful) throw new Error('Copy command failed');
    } catch (e) {
      prompt("Copy link:", text);
    }
  }
}
