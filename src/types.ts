export interface Customer {
  id?: string;
  name: string;
  mobile: string;
  secondaryMobiles?: string[];
  address: string;
  alternateMobile?: string;
  vehicleNumber?: string;
  notes?: string;
  pendingAmount: number;
  lastRate?: number;
  createdAt: any;
}

export interface Bill {
  id?: string;
  billNumber: string;
  date: any;
  customerId: string;
  customerName: string;
  customerMobile: string;
  customerAddress: string;
  tankerSize: string;
  quantity: number;
  rate: number;
  totalAmount: number;
  extraCharges: number;
  discount: number;
  grandTotal: number;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer' | 'Pending' | 'Split';
  splitPayments?: {
    cash: number;
    upi: number;
    bank?: number;
    pending: number;
  };
  driverName?: string;
  driverMobile?: string;
  tractorId?: string;
  status: 'Delivered' | 'Pending' | 'Cancelled' | 'Printed';
  isSettled: boolean;
  remarks?: string;
  createdAt: any;
}

export interface Tractor {
  id?: string;
  name: string;
  vehicleNumber: string;
  createdAt: any;
}

export interface DieselLog {
  id?: string;
  tractorId: string;
  tractorName: string;
  date: any;
  liters: number;
  amount: number;
  description: string;
  createdAt: any;
}

export interface MaintenanceLog {
  id?: string;
  tractorId: string;
  tractorName: string;
  date: any;
  amount: number;
  description: string;
  createdAt: any;
}

export interface LedgerEntry {
  id?: string;
  date: any;
  type: 'Income' | 'Expense';
  category: string;
  partyName?: string;
  partyId?: string;
  description: string;
  amount: number;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
  createdAt: any;
}

export type AccountMainType = 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity';

export interface AccountGroup {
  id?: string;
  name: string;
  parentGroupId?: string;
  type: AccountMainType;
}

export interface Account {
  id?: string;
  name: string;
  groupId: string;
  openingBalance: number;
  balanceType: 'Dr' | 'Cr';
  currentBalance: number;
  description?: string;
}

export type VoucherType = 'Receipt' | 'Payment' | 'Journal' | 'Contra' | 'Sales' | 'Purchase';

export interface VoucherItem {
  accountId: string;
  accountName: string;
  amount: number;
  type: 'Dr' | 'Cr';
  narration?: string;
}

export interface Voucher {
  id?: string;
  voucherNumber: string;
  date: any;
  type: VoucherType;
  items: VoucherItem[];
  narration: string;
  createdAt: any;
  totalAmount: number;
}

export interface Driver {
  id?: string;
  name: string;
  mobile: string;
  monthlySalary: number;
}

export type AttendanceStatus = 'Full Day' | 'Half Day' | 'Absent';

export interface AttendanceRecord {
  id?: string;
  driverId: string;
  driverName: string;
  date: any;
  status: AttendanceStatus;
  note?: string;
  createdAt: any;
}

export interface DriverLocation {
  id?: string;
  driverId: string;
  driverName: string;
  latitude: number;
  longitude: number;
  lastUpdated: any;
  isActive: boolean;
}
