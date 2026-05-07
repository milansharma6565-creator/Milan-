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

export interface Driver {
  id?: string;
  name: string;
  mobile: string;
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
