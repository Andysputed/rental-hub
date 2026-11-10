export type RoomStatus = 'occupied' | 'vacant';

export interface Room {
  id: string;
  number: string; // "01", "02", etc.
  name: string; // "Room 01"
  defaultRent: number; // 10000
  status: RoomStatus;
  currentTenancyId?: string;
  currentTenancy?: {
    id: string | number;
    tenantId: string | number;
    tenantName: string;
    tenantInitials: string;
    startDate: string;
    monthlyRent: number;
    deposit: number;
    rentDueDay: number;
    status: string;
  } | null;
}

export type TenancyStatus = 'active' | 'ended';

export interface Tenancy {
  id: string;
  roomId: string;
  tenantId: string;
  tenantName?: string;
  roomName?: string;
  startDate: string; // "2026-10-01"
  endDate?: string;
  monthlyRent: number; // KSh agreed rent
  deposit: number; // KSh deposit held
  rentDueDay: number; // 5th of each month
  status: TenancyStatus;
}

export interface Tenant {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  initials: string;
  status: 'active' | 'former';
  activeRoom?: {
    id: string | number;
    name: string;
    number: string;
    monthlyRent: number;
  } | null;
}

export type ChargeStatus = 'paid' | 'overdue' | 'partial' | 'unpaid';

export interface RentCharge {
  id: string;
  tenancyId: string;
  roomId: string;
  roomName?: string;
  tenantId?: string;
  tenantName?: string;
  month: string; // "2026-10"
  dueDate: string; // "2026-10-05"
  amount: number; // 10000
  paidAmount: number; // Amount paid towards this charge
  status: ChargeStatus;
  balance?: number;
}

export type PaymentMethod = 'mpesa' | 'cash' | 'bank';

export interface Payment {
  id: string;
  receiptNumber: string; // "RH-2026-003"
  tenantId: string;
  tenantName?: string;
  tenancyId: string;
  roomId: string;
  roomName?: string;
  chargeId: string;
  amount: number;
  date: string; // "2026-10-04"
  method: PaymentMethod;
  reference: string; // "UJ4R8K2M6P", "CASH-...", "BNK-..."
  notes?: string;
}

export interface ReceiptData {
  id: string | number;
  receiptNumber: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  notes?: string;
  tenant: {
    id: string | number;
    fullName: string;
    phone: string;
    email?: string;
  };
  room: {
    id: string | number;
    name: string;
    number: string;
  };
  property: {
    name: string;
    location: string;
    currency: string;
    landlordName: string;
    landlordInitials: string;
  };
  allocation: {
    chargeId?: string | number | null;
    month?: string | null;
    chargeAmount: number;
    balanceBefore: number;
    balanceAfter: number;
    amount?: number;
  };
  allocations?: Array<{
    chargeId: string | number;
    month: string;
    chargeAmount: number;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
  }>;
}

export type ExpenseCategory = 'maintenance' | 'utilities' | 'cleaning';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: string; // "2026-10-15"
  method: PaymentMethod;
  reference?: string;
  description?: string;
  property: string; // "Acacia House"
}

export interface PropertySettings {
  propertyName: string;
  location: string;
  landlordName: string;
  landlordInitials: string;
  landlordPhone: string;
  landlordEmail: string;
  currency: string;
  defaultDueDay: number;
  autoGenerateCharges: boolean;
  roomRents: Record<string, number>;
}

export interface DashboardMetrics {
  month: string;
  propertyName: string;
  totalRentCharged: number;
  totalRentReceived: number;
  totalOutstanding: number;
  totalExpenses: number;
  netCashIncome: number;
  collectionRate: number;
  occupancy: {
    totalRooms: number;
    occupiedCount: number;
    vacantCount: number;
    occupancyPercentage: number;
    rooms: Array<{ id: string | number; number: string; name: string; status: RoomStatus; isOccupied: boolean }>;
    potentialRent: number;
  };
  overdueCount: number;
  needsAttention: Array<{
    chargeId: string | number;
    roomId: string | number;
    roomName: string;
    tenantName: string;
    tenantPhone: string;
    amount: number;
    paidAmount: number;
    balance: number;
    dueDate: string;
    daysOverdue: number;
    status: ChargeStatus;
  }>;
  recentPayments: Array<{
    id: string | number;
    receiptNumber: string;
    tenantName: string;
    roomName: string;
    amount: number;
    date: string;
    method: PaymentMethod;
    reference: string;
  }>;
}

export interface MonthlyFinancialReport {
  month: string;
  asOfDate: string;
  property: {
    name: string;
    location: string;
    currency: string;
  };
  summary: {
    rentCharged: number;
    rentReceived: number;
    outstandingRent: number;
    totalExpenses: number;
    netCashIncome: number;
    collectionRate: number;
    occupancyPercentage: number;
    occupiedRooms: number;
    totalRooms: number;
    potentialFullOccupancy: number;
  };
  cashMovement: {
    rentReceived: number;
    expenses: number;
    netCashIncome: number;
  };
  expenseBreakdown: {
    total: number;
    byCategory: Record<string, number>;
    items: Array<{
      id: string | number;
      category: ExpenseCategory;
      title: string;
      amount: number;
      date: string;
      method: PaymentMethod;
      reference?: string;
      description?: string;
    }>;
  };
  outstandingBalances: {
    total: number;
    count: number;
    items: Array<{
      id: string | number;
      roomName: string;
      tenantName: string;
      amount: number;
      paidAmount: number;
      balance: number;
      dueDate: string;
      daysOverdue: number;
    }>;
  };
  reconciliationNotes: string;
}

export type DepositStatus = 'held' | 'settled' | 'refunded' | 'applied';

export interface DepositDeduction {
  id: string | number;
  deductionType: 'rent' | 'repair' | 'cleaning' | 'other';
  description: string;
  amount: number;
  chargeId?: string | number | null;
  chargeMonth?: string | null;
  createdAt?: string;
}

export interface Deposit {
  id: string;
  tenancyId: string;
  tenantId?: string;
  tenantName: string;
  tenantPhone?: string;
  roomId?: string;
  roomName: string;
  roomNumber?: string;
  amount: number;
  receivedDate: string;
  status: DepositStatus;
  reference: string;
  notes?: string;
  rentDeducted: number;
  repairsDeducted: number;
  totalDeductions: number;
  refundableBalance: number;
  refundAmount: number;
  refundMethod?: PaymentMethod | string;
  refundReference?: string;
  refundDate?: string | null;
  settledAt?: string | null;
  settlementNotes?: string;
  deductions: DepositDeduction[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SettlementSummary {
  tenancyId: string | number;
  tenantId: string | number;
  tenantName: string;
  roomId: string | number;
  roomName: string;
  startDate: string;
  endDate?: string | null;
  tenancyStatus: TenancyStatus;
  deposit: {
    id: string | number;
    amount: number;
    status: DepositStatus;
    receivedDate: string;
    reference: string;
    rentDeducted: number;
    repairsDeducted: number;
    totalDeductions: number;
    refundableBalance: number;
    refundAmount: number;
    settledAt?: string | null;
  } | null;
  eligibleArrears: {
    total: number;
    charges: Array<{
      id: string | number;
      month: string;
      amount: number;
      paidAmount: number;
      balance: number;
      dueDate: string;
    }>;
  };
  maxDeductionAllowed: number;
}

export interface SettleDepositPayload {
  endDate?: string;
  settlementDate?: string;
  rentDeduction: number;
  repairDeductions: Array<{
    description: string;
    amount: number;
    category: 'repair' | 'cleaning' | 'other';
  }>;
  refundAmount: number;
  refundMethod?: string;
  refundReference?: string;
  refundDate?: string;
  notes?: string;
}

