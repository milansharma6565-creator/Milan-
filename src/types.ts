export interface Franchise {
  id?: string;
  email: string;
  name: string;
  location?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  commissionPercentage: number;
  authorizedBy: string;
  status: 'Active' | 'Inactive' | 'Suspended' | 'Testing';
  lockedFeatures?: string[];
  createdAt: any;
  gstNumber?: string;
  proprietorName?: string;
  aadharNumber?: string;
  isTesting?: boolean;
  conversionRequested?: boolean;
  letterheadTemplateId?: string;
  servicesEnabled?: {
    tanker: boolean;
    can: boolean;
    bottle: boolean;
  };
  superAdminServices?: {
    tanker: boolean;
    can: boolean;
    bottle: boolean;
  };
  customRates?: FranchiseCustomRates;
  loyaltyProgramEnabled?: boolean;
  allowSystemMaintenance?: boolean;
}

export interface FranchiseCustomRates {
  tankerBase?: number;         // default 350
  standbyTankerBase?: number;  // default 900
  standbyTankerExtraDay?: number; // default 600
  monthlyTankerBase?: number;  // default 10000
  can20lBase?: number;         // default 80
  can20lBookingBase?: number;  // default 30
  monthlyCanBase?: number;     // default 600
  bottle500ml?: number;        // default 10
  bottle1l?: number;           // default 20
  bottle2l?: number;           // default 35
  tanker5000L?: number;        // default 400
  tanker7500L?: number;        // default 600
  tanker10000L?: number;       // default 800
  tanker15000L?: number;       // default 1200
  [key: string]: number | undefined; // Allow index access
}

export interface ActivityLog {
  id?: string;
  franchiseId: string;
  franchiseName: string;
  userEmail: string;
  actionType: 'RATE_CHANGE' | 'PRINT_SETTING_CHANGE' | 'SERVICE_TOGGLE' | 'BILL_GENERATE' | 'BILL_STATUS_CHANGE' | 'DRIVER_CHANGE' | 'COMMISSION_CHANGE' | 'NEW_BILL' | 'FRANCHISE_CREATED' | 'FRANCHISE_UPDATED' | string;
  description: string;
  timestamp: any;
  ipAddress?: string;
  details?: any;
}

export interface Customer {
  id?: string;
  franchiseId?: string;
  name: string;
  mobile: string;
  email?: string;
  secondaryMobiles?: string[];
  address: string;
  alternateMobile?: string;
  vehicleNumber?: string;
  notes?: string;
  pendingAmount: number;
  lastRate?: number;
  pin?: string;
  nextDayCans?: number;
  category?: ProductCategory;
  createdAt: any;
  loyaltyCoins?: number;
}

export type ProductCategory = 'TANKER' | 'STANDBY_TANKER' | 'MONTHLY_TANKER' | 'MONTHLY_CAN' | 'BOTTLE' | 'CAN' | 'DONATION';

export interface Bill {
  id?: string;
  franchiseId?: string;
  billNumber: string;
  date: any;
  customerId: string;
  customerName: string;
  customerMobile: string;
  customerAddress: string;
  category: ProductCategory;
  tankerSize?: string;
  bottleSize?: '500ml' | '1L' | '2L';
  quantity: number;
  rate: number;
  totalAmount: number;
  extraCharges: number;
  discount: number;
  grandTotal: number;
  commissionAmount?: number; // Calculated commission for this bill
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer' | 'Pending' | 'Split';
  splitPayments?: {
    cash: number;
    upi: number;
    bank?: number;
    pending: number;
  };
  driverId?: string;
  driverName?: string;
  driverMobile?: string;
  tractorId?: string;
  deliveryLocation?: {
    lat: number;
    lng: number;
    address: string;
    mapLink?: string;
  };
  status: 'Delivered' | 'Pending' | 'Filling' | 'Cancelled' | 'Printed' | 'Assigned' | 'On the way' | 'Reached' | 'Scheduled';
  isSettled: boolean;
  isScheduled?: boolean;
  scheduledDate?: string;
  scheduledStatus?: 'Pending_Activation' | 'Activated';
  remarks?: string;
  createdAt: any;
  completedAt?: any;
  includedPendingDues?: boolean;
  previousPendingDuesAmount?: number;
  previousPendingDuesDetails?: string;
  combinedTotalAmount?: number;
}

export interface Trip {
  id?: string;
  franchiseId?: string;
  billId: string;
  billNumber: string;
  driverId: string;
  driverName: string;
  customerName: string;
  customerMobile: string;
  siteLocation: string;
  category: ProductCategory;
  deliveryLocation?: {
    lat: number;
    lng: number;
    address: string;
    mapLink?: string;
  };
  quantity: number;
  tankerSize?: string;
  bottleSize?: '500ml' | '1L' | '2L';
  tankerNumber?: string;
  status: 'Active' | 'Filling' | 'On the way' | 'Reached' | 'Delivered';
  createdAt: any;
  completedAt?: any;
}

export interface BookingRequest {
  id?: string;
  franchiseId?: string;
  billId: string | null;
  customerId: string;
  customerName: string;
  customerMobile: string;
  category: ProductCategory;
  tankerSize?: string;
  bottleSize?: '500ml' | '1L' | '2L';
  quantity?: number;
  remarks?: string;
  location?: {
    lat: number;
    lng: number;
    address: string;
  };
  distanceKm?: number;
  totalEstimate?: number;
  status: 'Pending' | 'Accepted' | 'Rejected';
  requestedAt: any;
  updatedAt: any;
}

export interface Tractor {
  id?: string;
  franchiseId?: string;
  name: string;
  vehicleNumber: string;
  insuranceExpiry: any;
  createdAt: any;
}

export interface DieselLog {
  id?: string;
  franchiseId?: string;
  tractorId: string;
  tractorName: string;
  date: any;
  liters: number;
  amount: number;
  description: string;
  paymentMode?: 'Cash' | 'Bank' | 'Udhaar';
  paymentAccountId?: string;
  createdAt: any;
}

export interface MaintenanceLog {
  id?: string;
  franchiseId?: string;
  tractorId: string;
  tractorName: string;
  date: any;
  amount: number;
  description: string;
  paymentMode?: 'Cash' | 'Bank' | 'Udhaar';
  paymentAccountId?: string;
  createdAt: any;
}

export interface LedgerEntry {
  id?: string;
  franchiseId?: string;
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
  franchiseId?: string;
  name: string;
  parentGroupId?: string;
  type: AccountMainType;
}

export interface Account {
  id?: string;
  franchiseId?: string;
  name: string;
  groupId: string;
  openingBalance: number;
  openingBalanceDate?: any;
  balanceType: 'Dr' | 'Cr';
  currentBalance: number;
  description?: string;
  isHidden?: boolean;
  driverId?: string;
  customerId?: string;
  group?: string;
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
  franchiseId?: string;
  voucherNumber: string;
  date: any;
  type: VoucherType;
  items: VoucherItem[];
  narration: string;
  createdAt: any;
  totalAmount: number;
  isHidden?: boolean;
}

export interface Driver {
  id?: string;
  franchiseId?: string;
  name: string;
  mobile: string;
  monthlySalary: number;
  status?: 'Active' | 'Inactive' | 'pending';
  pin?: string;
  email?: string;
  createdAt?: any;
  showDashboardToDriver?: boolean;
}

export type AttendanceStatus = 'Full Day' | 'Half Day' | 'Absent';

export interface AttendanceRecord {
  id?: string;
  franchiseId?: string;
  driverId: string;
  driverName: string;
  date: any;
  status: AttendanceStatus;
  note?: string;
  createdAt: any;
}

export interface DriverLocation {
  id?: string;
  franchiseId?: string;
  driverId: string;
  driverName: string;
  latitude: number;
  longitude: number;
  lastUpdated: any;
  isActive: boolean;
}

export interface HydrantFilling {
  id?: string;
  franchiseId?: string;
  tokenNumber: string;
  date: any;
  type: 'Inward' | 'Outward';
  partyName: string;
  vehicleNumber?: string;
  rate: number;
  quantity: number;
  totalAmount: number;
  paymentMode: 'Cash' | 'Bank' | 'Udhaar';
  paymentAccountId?: string;
  status: 'Completed' | 'Pending';
  remarks?: string;
  createdAt: any;
}
