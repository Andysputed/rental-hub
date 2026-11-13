import React, { useState, useEffect, useCallback } from 'react';
import type { Room, Tenant, Tenancy, RentCharge, Payment, Expense, PropertySettings, Deposit, SettleDepositPayload, MoveOutRequest } from '../types';
import {
  roomsApi,
  tenantsApi,
  tenanciesApi,
  rentChargesApi,
  paymentsApi,
  depositsApi,
  expensesApi,
  settingsApi,
} from '../services/api';
import { getCurrentMonth } from '../utils/format';
import { getErrorMessage } from '../services/api';
import { RentalContext } from './rentalContextState';

interface RecordPaymentInput {
  tenantId?: string;
  tenancyId?: string;
  roomId: string;
  chargeId?: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
  notes?: string;
  chargeMonth?: string;
  allocationMode?: 'automatic' | 'manual';
  allocations?: Array<{ chargeId: string; amount: string | number }>;
  reservations?: Array<{ month: string; amount: string | number }>;
}

interface RegisterTenantInput {
  fullName: string;
  phone: string;
  email?: string;
}

interface RegisterTenancyInput {
  roomId: string;
  monthlyRent: number;
  deposit?: number;
  depositRequired?: number;
  depositPaid?: number;
  depositMethod?: string;
  depositReference?: string;
  depositWaived?: boolean;
  depositWaivedReason?: string;
  startDate: string;
  rentDueDay: number;
}

interface AddExpenseInput {
  category: string;
  title: string;
  amount: number;
  date: string;
  method: string;
  reference?: string;
  description?: string;
  property?: string;
}

export interface RentalContextType {
  settings: PropertySettings;
  rooms: Room[];
  tenants: Tenant[];
  tenancies: Tenancy[];
  rentCharges: RentCharge[];
  payments: Payment[];
  expenses: Expense[];
  deposits: Deposit[];
  selectedMonth: string; // "2026-10"
  setSelectedMonth: (month: string) => void;
  isLoading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;

  // Computed metrics
  totalRentCharged: number;
  totalRentReceived: number;
  totalOutstanding: number;
  totalExpenses: number;
  netCashIncome: number;
  occupancyCount: number;
  occupancyPercentage: number;
  overdueCount: number;
  totalDepositsHeld: number;
  totalDepositsRefunded: number;

  // Actions
  recordPayment: (payment: RecordPaymentInput) => Promise<Payment>;
  registerTenant: (tenantData: RegisterTenantInput, tenancyData: RegisterTenancyInput) => Promise<void>;
  recordDepositPayment: (
    depositId: string | number,
    payload: {
      amount: number;
      paymentDate: string;
      method?: string;
      reference?: string;
      notes?: string;
    }
  ) => Promise<Deposit>;
  moveOutTenant: (tenancyId: string | number, payload: MoveOutRequest) => Promise<void>;
  settleDeposit: (tenancyId: string | number, payload: SettleDepositPayload) => Promise<Deposit>;
  addExpense: (expense: AddExpenseInput) => Promise<void>;
  generateMonthlyCharges: (month: string) => Promise<number>;
  updateSettings: (settings: Partial<PropertySettings>) => Promise<void>;
  getTenantById: (id: string) => Tenant | undefined;
  getRoomById: (id: string) => Room | undefined;
  getPaymentById: (id: string) => Payment | undefined;
  getTenancyForRoom: (roomId: string) => Tenancy | undefined;
  getChargeForRoom: (roomId: string, month?: string) => RentCharge | undefined;
  getOverdueCharges: () => (RentCharge & { tenantId?: string; tenantName: string; tenantPhone?: string; roomName: string; balance: number; isFormerTenant?: boolean; tenancyStatus?: string })[];
  resetToDefaultData: () => void;
}

const DEFAULT_SETTINGS: PropertySettings = {
  propertyName: 'Kimumu Rentals',
  location: 'Kimumu, Eldoret, Kenya',
  landlordName: 'Veronicah K.',
  landlordInitials: 'VK',
  landlordPhone: '',
  landlordEmail: '',
  currency: 'KES',
  defaultDueDay: 5,
  autoGenerateCharges: true,
  roomRents: {
    '01': 10000,
    '02': 10000,
    '03': 10000,
    '04': 10000,
    '05': 10000,
    '06': 10000,
  },
};

export const RentalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedMonth, setSelectedMonthState] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem('rentalhub_selected_month');
      if (stored && /^\d{4}-(0[1-9]|1[0-2])$/.test(stored)) {
        return stored;
      }
    } catch {
      // fallback
    }
    return getCurrentMonth();
  });

  const setSelectedMonth = useCallback((month: string) => {
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    setSelectedMonthState(month);
    try {
      sessionStorage.setItem('rentalhub_selected_month', month);
    } catch {
      // fallback
    }
  }, []);
  const [settings, setSettings] = useState<PropertySettings>(DEFAULT_SETTINGS);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [rentCharges, setRentCharges] = useState<RentCharge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all live data from Django backend API
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        fetchedSettings,
        fetchedRooms,
        fetchedTenants,
        fetchedTenancies,
        fetchedCharges,
        fetchedPayments,
        fetchedExpenses,
        fetchedDeposits,
      ] = await Promise.all([
        settingsApi.get().catch(() => DEFAULT_SETTINGS),
        roomsApi.list().catch(() => []),
        tenantsApi.list().catch(() => []),
        tenanciesApi.list().catch(() => []),
        rentChargesApi.list({ month: selectedMonth }).catch(() => []),
        paymentsApi.list().catch(() => []),
        expensesApi.list({ month: selectedMonth }).catch(() => []),
        depositsApi.list().catch(() => []),
      ]);

      setSettings(fetchedSettings);
      setRooms(fetchedRooms);
      setTenants(fetchedTenants);
      setTenancies(fetchedTenancies);
      setRentCharges(fetchedCharges);
      setPayments(fetchedPayments);
      setExpenses(fetchedExpenses);
      setDeposits(fetchedDeposits);
      setError(null);
    } catch (err: unknown) {
      console.error('Failed to load data from Django backend:', err);
      setError(getErrorMessage(err, 'Could not connect to backend server'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    queueMicrotask(() => { void refreshData(); });
  }, [refreshData]);

  // Computed metrics directly derived from backend data
  const currentMonthCharges = rentCharges.filter((c) => c.month === selectedMonth);
  const now = new Date();
  const localToday = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const totalRentCharged = currentMonthCharges.reduce((acc, c) => acc + c.amount, 0);
  const totalRentReceived = currentMonthCharges.reduce((acc, c) => acc + c.paidAmount, 0);
  const totalOutstanding = currentMonthCharges.reduce((acc, c) => acc + (c.amount - c.paidAmount), 0);

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const netCashIncome = totalRentReceived - totalExpenses;

  const occupancyCount = rooms.filter((r) => r.status === 'occupied').length;
  const occupancyPercentage = rooms.length > 0 ? Math.round((occupancyCount / rooms.length) * 100) : 0;
  const overdueCount = currentMonthCharges.filter((c) => c.dueDate <= localToday && c.amount - c.paidAmount > 0).length;
  const totalDepositsHeld = deposits.filter((d) => d.status === 'held').reduce((acc, d) => acc + d.amount, 0);
  const totalDepositsRefunded = deposits.reduce((acc, d) => acc + (d.refundAmount || 0), 0);

  // Actions connecting to real backend API
  const recordPayment = async (paymentData: RecordPaymentInput): Promise<Payment> => {
    try {
      const newPayment = await paymentsApi.record({
        roomId: paymentData.roomId,
        amount: paymentData.amount,
        method: paymentData.method,
        reference: paymentData.reference,
        paymentDate: paymentData.date,
        chargeId: paymentData.chargeId,
        chargeMonth: paymentData.chargeMonth,
        tenancyId: paymentData.tenancyId,
        allocationMode: paymentData.allocationMode,
        allocations: paymentData.allocations,
        reservations: paymentData.reservations,
        notes: paymentData.notes,
      });

      // Synchronize data from backend
      await refreshData();
      return newPayment;
    } catch (err: unknown) {
      console.error('Record payment error:', err);
      throw err;
    }
  };

  const registerTenant = async (
    tenantData: RegisterTenantInput,
    tenancyData: RegisterTenancyInput
  ): Promise<void> => {
    try {
      await tenanciesApi.register({
        fullName: tenantData.fullName,
        phone: tenantData.phone,
        email: tenantData.email,
        roomId: tenancyData.roomId,
        moveInDate: tenancyData.startDate,
        monthlyRent: tenancyData.monthlyRent,
        depositRequired: tenancyData.depositRequired,
        depositPaid: tenancyData.depositPaid,
        depositMethod: tenancyData.depositMethod,
        depositReference: tenancyData.depositReference,
        depositWaived: tenancyData.depositWaived,
        depositWaivedReason: tenancyData.depositWaivedReason,
        deposit: tenancyData.deposit,
        rentDueDay: tenancyData.rentDueDay,
      });

      await refreshData();
    } catch (err: unknown) {
      console.error('Register tenant error:', err);
      throw err;
    }
  };

  const recordDepositPayment = async (
    depositId: string | number,
    payload: {
      amount: number;
      paymentDate: string;
      method?: string;
      reference?: string;
      notes?: string;
    }
  ): Promise<Deposit> => {
    try {
      const res = await depositsApi.recordPayment(depositId, payload);
      await refreshData();
      return res;
    } catch (err: unknown) {
      console.error('Record deposit payment error:', err);
      throw err;
    }
  };

  const moveOutTenant = async (
    tenancyId: string | number,
    payload: MoveOutRequest
  ): Promise<void> => {
    try {
      await tenanciesApi.moveOut(tenancyId, payload);
      await refreshData();
    } catch (err: unknown) {
      console.error('Move out tenant error:', err);
      throw err;
    }
  };

  const settleDeposit = async (
    tenancyId: string | number,
    payload: SettleDepositPayload
  ): Promise<Deposit> => {
    try {
      const settled = await tenanciesApi.settleDeposit(tenancyId, payload);
      await refreshData();
      return settled;
    } catch (err: unknown) {
      console.error('Settle deposit error:', err);
      throw err;
    }
  };

  const addExpense = async (expenseData: AddExpenseInput): Promise<void> => {
    try {
      await expensesApi.create({
        category: expenseData.category,
        title: expenseData.title,
        amount: expenseData.amount,
        date: expenseData.date,
        method: expenseData.method,
        reference: expenseData.reference,
        description: expenseData.description,
      });

      await refreshData();
    } catch (err: unknown) {
      console.error('Add expense error:', err);
      throw err;
    }
  };

  const generateMonthlyCharges = async (month: string): Promise<number> => {
    try {
      const res = await rentChargesApi.generate(month);
      await refreshData();
      return res.createdCount;
    } catch (err: unknown) {
      console.error('Generate charges error:', err);
      throw err;
    }
  };

  const updateSettings = async (newSettings: Partial<PropertySettings>): Promise<void> => {
    try {
      const updated = await settingsApi.update(newSettings);
      setSettings(updated);
      await refreshData();
    } catch (err: unknown) {
      console.error('Update settings error:', err);
      throw err;
    }
  };

  const getTenantById = (id: string): Tenant | undefined => {
    return tenants.find((t) => String(t.id) === String(id));
  };

  const getRoomById = (id: string): Room | undefined => {
    return rooms.find((r) => String(r.id) === String(id));
  };

  const getPaymentById = (id: string): Payment | undefined => {
    return payments.find((p) => String(p.id) === String(id));
  };

  const getTenancyForRoom = (roomId: string): Tenancy | undefined => {
    return tenancies.find((t) => String(t.roomId) === String(roomId) && t.status === 'active');
  };

  const getChargeForRoom = (roomId: string, month = selectedMonth): RentCharge | undefined => {
    const activeTenancy = getTenancyForRoom(roomId);
    if (!activeTenancy) return undefined;
    return rentCharges.find((c) => String(c.tenancyId) === String(activeTenancy.id) && c.month === month);
  };

  const getOverdueCharges = () => {
    return currentMonthCharges
      .filter((c) => c.dueDate <= localToday && c.amount - c.paidAmount > 0)
      .map((c) => {
        const room = rooms.find((r) => String(r.id) === String(c.roomId));
        const tenancy = tenancies.find((t) => String(t.id) === String(c.tenancyId));
        const tenant = tenancy ? tenants.find((t) => String(t.id) === String(tenancy.tenantId)) : undefined;
        return {
          ...c,
          tenantId: tenant ? String(tenant.id) : undefined,
          tenantName: tenant ? tenant.fullName : 'Unknown',
          tenantPhone: tenant ? tenant.phone : undefined,
          roomName: room ? room.name : 'Unknown Room',
          balance: c.amount - c.paidAmount,
          isFormerTenant: tenancy ? tenancy.status === 'ended' : false,
          tenancyStatus: tenancy ? tenancy.status : 'unknown',
        };
      });
  };

  const resetToDefaultData = () => {
    refreshData();
  };

  return (
    <RentalContext.Provider
      value={{
        settings,
        rooms,
        tenants,
        tenancies,
        rentCharges,
        payments,
        expenses,
        deposits,
        selectedMonth,
        setSelectedMonth,
        isLoading,
        error,
        refreshData,
        totalRentCharged,
        totalRentReceived,
        totalOutstanding,
        totalExpenses,
        netCashIncome,
        occupancyCount,
        occupancyPercentage,
        overdueCount,
        totalDepositsHeld,
        totalDepositsRefunded,
        recordPayment,
        registerTenant,
        recordDepositPayment,
        moveOutTenant,
        settleDeposit,
        addExpense,
        generateMonthlyCharges,
        updateSettings,
        getTenantById,
        getRoomById,
        getPaymentById,
        getTenancyForRoom,
        getChargeForRoom,
        getOverdueCharges,
        resetToDefaultData,
      }}
    >
      {children}
    </RentalContext.Provider>
  );
};
