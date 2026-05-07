import Dexie, { Table } from 'dexie';

export interface Customer {
  id?: number;
  name: string;
  mobile: string;
  secondaryMobiles?: string[];
  address: string;
  alternateMobile?: string;
  vehicleNumber?: string;
  notes?: string;
  pendingAmount: number;
  lastRate?: number;
  createdAt: Date;
}

export interface Bill {
  id?: number;
  billNumber: string;
  date: Date;
  customerId: number;
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
  tractorId?: number;
  status: 'Delivered' | 'Pending' | 'Cancelled' | 'Printed';
  isSettled: boolean;
  createdAt: Date;
}

export interface Tractor {
  id?: number;
  name: string;
  vehicleNumber: string;
  createdAt: Date;
}

export interface DieselLog {
  id?: number;
  tractorId: number;
  tractorName: string;
  date: Date;
  liters: number;
  amount: number;
  description: string;
  createdAt: Date;
}

export interface MaintenanceLog {
  id?: number;
  tractorId: number;
  tractorName: string;
  date: Date;
  amount: number;
  description: string;
  createdAt: Date;
}

export interface LedgerEntry {
  id?: number;
  date: Date;
  type: 'Income' | 'Expense';
  category: string;
  partyName?: string;
  partyId?: number;
  description: string;
  amount: number;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
  createdAt: Date;
}

export class RajhansDatabase extends Dexie {
  customers!: Table<Customer>;
  bills!: Table<Bill>;
  drivers!: Table<Driver>;
  ledger!: Table<LedgerEntry>;
  tractors!: Table<Tractor>;
  dieselLogs!: Table<DieselLog>;
  maintenanceLogs!: Table<MaintenanceLog>;

  constructor() {
    super('RajhansDB');
    this.version(6).stores({
      customers: '++id, &mobile, *secondaryMobiles, name',
      bills: '++id, billNumber, date, customerId, status, isSettled, tractorId',
      drivers: '++id, name, mobile',
      ledger: '++id, date, type, category, partyId',
      tractors: '++id, vehicleNumber',
      dieselLogs: '++id, date, tractorId',
      maintenanceLogs: '++id, date, tractorId'
    });
  }
}

export interface Driver {
  id?: number;
  name: string;
  mobile: string;
}

export const db = new RajhansDatabase();
