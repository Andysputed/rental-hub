import type {
  Room,
  Tenant,
  Tenancy,
  RentCharge,
  Payment,
  Expense,
  PropertySettings,
  ReceiptData,
  DashboardMetrics,
  MonthlyFinancialReport,
  Deposit,
  SettlementSummary,
  SettleDepositPayload,
  MoveOutRequest,
  PaymentMethod,
  DepositDeduction,
  DepositPayment,
} from '../types';

interface ApiPage<T> { results: T[]; next: string | null; }
interface RoomResponse {
  id: string | number; number: string; name: string; defaultRent?: number | string;
  default_rent?: number | string; status: Room['status']; currentTenancyId?: string | number | null;
  currentTenancy?: Room['currentTenancy'];
}
interface TenantResponse {
  id: string | number; fullName?: string; full_name?: string; phone: string; email?: string;
  initials: string; status: Tenant['status']; activeRoom?: Tenant['activeRoom'];
}
interface TenancyResponse {
  id: string | number; roomId: string | number; tenantId: string | number; tenantName?: string;
  roomName?: string; startDate: string; endDate?: string; monthlyRent: number | string;
  deposit: number | string; rentDueDay: number | string; status: Tenancy['status'];
}
interface ChargeResponse {
  id: string | number; tenancyId: string | number; roomId: string | number; roomName?: string;
  tenantId: string | number; tenantName?: string; month: string; dueDate: string;
  amount: number | string; paidAmount: number | string; status: RentCharge['status']; balance: number | string;
}
interface PaymentResponse {
  id: string | number; receiptNumber?: string; receipt_number?: string; tenantId: string | number;
  tenantName?: string; tenancyId: string | number; roomId: string | number; roomName?: string;
  chargeId?: string | number | null; amount: number | string; date: string; method: PaymentMethod;
  reference: string; notes?: string;
  allocations?: NonNullable<Payment['allocations']>; reservations?: NonNullable<Payment['reservations']>;
  refunds?: NonNullable<Payment['refunds']>; availableCredit?: number | string; isReversed?: boolean;
}
interface DepositResponse extends Omit<Deposit, 'id' | 'tenancyId' | 'amount' | 'requiredAmount' | 'totalPaid' | 'outstandingBalance' | 'rentDeducted' | 'repairsDeducted' | 'totalDeductions' | 'refundableBalance' | 'refundAmount' | 'deductions' | 'payments'> {
  id: string | number; tenancyId: string | number; amount: number | string; requiredAmount?: number | string;
  totalPaid?: number | string; outstandingBalance?: number | string; rentDeducted?: number | string;
  repairsDeducted?: number | string; totalDeductions?: number | string; refundableBalance?: number | string;
  refundAmount?: number | string; received_date?: string; created_at?: string; updated_at?: string;
  deductions?: Array<Partial<DepositDeduction> & { deduction_type?: DepositDeduction['deductionType']; created_at?: string }>;
  payments?: Array<Partial<DepositPayment> & { payment_date?: string; created_at?: string }>;
}
interface ExpenseResponse {
  id: string | number; category: Expense['category']; title: string; amount: number | string;
  date: string; method: Expense['method']; reference?: string; description?: string; propertyName?: string;
}
type SettingsResponse = PropertySettings;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function getErrorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
export function getApiErrorDetail(value: unknown, keys: string[], fallback: string): string {
  if (value instanceof ApiError && isRecord(value.data)) {
    for (const key of keys) {
      const detail = value.data[key];
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && typeof detail[0] === 'string') return detail[0];
    }
  }
  return getErrorMessage(value, fallback);
}

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000/api/v1' : '')).replace(/\/$/, '');
let csrfToken: string | null = null;

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (csrfToken && !forceRefresh) return csrfToken;
  const response = await fetch(`${API_BASE_URL}/auth/csrf/`, { credentials: 'include' });
  if (!response.ok) throw new ApiError('Unable to establish a secure session.', response.status);
  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.csrfToken !== 'string') {
    throw new ApiError('Unable to establish a secure session.', response.status);
  }
  csrfToken = data.csrfToken;
  return csrfToken;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith('https://') || endpoint.startsWith('http://')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options.headers || {});
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    headers.set('X-CSRFToken', await getCsrfToken());
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...options, method, headers, credentials: 'include' });
}

export class ApiError extends Error {
  public status: number;
  public data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await apiFetch(endpoint, options);

    if (!response.ok) {
      let errorData: unknown = null;
      let errorMsg = `API request failed with status ${response.status}`;
      try {
        errorData = await response.json();
        if (isRecord(errorData)) {
          if (typeof errorData.error === 'string') {
            errorMsg = errorData.error;
          } else if (typeof errorData.detail === 'string') {
            errorMsg = errorData.detail;
          } else {
            // First validation error message
            const firstKey = Object.keys(errorData)[0];
            const firstVal = errorData[firstKey];
            if (Array.isArray(firstVal) && firstVal.length > 0) {
              errorMsg = `${firstKey}: ${firstVal[0]}`;
            } else if (typeof firstVal === 'string') {
              errorMsg = `${firstKey}: ${firstVal}`;
            }
          }
        }
      } catch {
        // Response was not JSON
      }
      throw new ApiError(errorMsg, response.status, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      getErrorMessage(err, 'Network connection failed. Please check if the Django backend server is running.'),
      0
    );
  }
}

async function requestAll<T>(endpoint: string): Promise<T[]> {
  const first = await request<T[] | ApiPage<T>>(endpoint);
  if (Array.isArray(first)) return first as T[];
  const items: T[] = [...(first.results ?? [])];
  let next: string | null = first.next ?? null;
  const apiBase = new URL(API_BASE_URL);
  while (next) {
    const nextUrl = new URL(next, API_BASE_URL);
    if (nextUrl.origin !== apiBase.origin || !(nextUrl.pathname === apiBase.pathname || nextUrl.pathname.startsWith(`${apiBase.pathname}/`))) {
      throw new ApiError('The API returned an invalid pagination link.', 502);
    }
    const page = await request<ApiPage<T>>(nextUrl.href);
    if (!page || !Array.isArray(page.results)) throw new ApiError('The API returned an invalid page.', 502);
    items.push(...page.results);
    next = page.next ?? null;
  }
  return items;
}

// 1. Rooms API
export const roomsApi = {
  list: async (status?: 'occupied' | 'vacant'): Promise<Room[]> => {
    const query = status ? `?status=${status}` : '';
    const rawRooms = await requestAll<RoomResponse>(`/rooms/${query}`);
    return rawRooms.map((r) => ({
      id: String(r.id),
      number: r.number,
      name: r.name,
      defaultRent: Number(r.defaultRent ?? r.default_rent),
      status: r.status,
      currentTenancyId: r.currentTenancyId ? String(r.currentTenancyId) : undefined,
      currentTenancy: r.currentTenancy
        ? {
            ...r.currentTenancy,
            id: String(r.currentTenancy.id),
            tenantId: String(r.currentTenancy.tenantId),
          }
        : null,
    }));
  },
  get: async (id: string | number): Promise<Room> => {
    const r = await request<RoomResponse>(`/rooms/${id}/`);
    return {
      id: String(r.id),
      number: r.number,
      name: r.name,
      defaultRent: Number(r.defaultRent ?? r.default_rent),
      status: r.status,
      currentTenancyId: r.currentTenancyId ? String(r.currentTenancyId) : undefined,
      currentTenancy: r.currentTenancy,
    };
  },
};

// 2. Tenants API
export const tenantsApi = {
  list: async (search?: string, status?: 'active' | 'former'): Promise<Tenant[]> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const raw = await requestAll<TenantResponse>(`/tenants/${qs}`);
    return raw.map((t) => ({
      id: String(t.id),
      fullName: t.fullName ?? t.full_name,
      phone: t.phone,
      email: t.email,
      initials: t.initials,
      status: t.status,
      activeRoom: t.activeRoom,
    }));
  },
  get: async (id: string | number): Promise<Tenant> => {
    const t = await request<TenantResponse>(`/tenants/${id}/`);
    return {
      id: String(t.id),
      fullName: t.fullName ?? t.full_name,
      phone: t.phone,
      email: t.email,
      initials: t.initials,
      status: t.status,
      activeRoom: t.activeRoom,
    };
  },
};

// 3. Tenancies API
export const tenanciesApi = {
  list: async (params?: { roomId?: string | number; tenantId?: string | number; status?: string }): Promise<Tenancy[]> => {
    const sp = new URLSearchParams();
    if (params?.roomId) sp.append('roomId', String(params.roomId));
    if (params?.tenantId) sp.append('tenantId', String(params.tenantId));
    if (params?.status) sp.append('status', params.status);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const raw = await requestAll<TenancyResponse>(`/tenancies/${qs}`);
    return raw.map((t) => ({
      id: String(t.id),
      roomId: String(t.roomId),
      tenantId: String(t.tenantId),
      tenantName: t.tenantName,
      roomName: t.roomName,
      startDate: t.startDate,
      endDate: t.endDate,
      monthlyRent: Number(t.monthlyRent),
      deposit: Number(t.deposit),
      rentDueDay: Number(t.rentDueDay),
      status: t.status,
    }));
  },
  register: async (payload: {
    fullName: string;
    phone: string;
    email?: string;
    roomId: string | number;
    moveInDate: string;
    monthlyRent: number;
    depositRequired?: number;
    depositPaid?: number;
    depositMethod?: string;
    depositReference?: string;
    depositWaived?: boolean;
    depositWaivedReason?: string;
    deposit?: number;
    rentDueDay?: number;
  }): Promise<Tenancy> => {
    const raw = await request<TenancyResponse>('/tenancies/register/', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        roomId: Number(payload.roomId),
      }),
    });
    return {
      id: String(raw.id),
      roomId: String(raw.roomId),
      tenantId: String(raw.tenantId),
      tenantName: raw.tenantName,
      roomName: raw.roomName,
      startDate: raw.startDate,
      endDate: raw.endDate,
      monthlyRent: Number(raw.monthlyRent),
      deposit: Number(raw.deposit),
      rentDueDay: Number(raw.rentDueDay),
      status: raw.status,
    };
  },
  moveOut: async (tenancyId: string | number, payload: MoveOutRequest): Promise<Tenancy> => {
    const raw = await request<TenancyResponse>(`/tenancies/${tenancyId}/move-out/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      id: String(raw.id),
      roomId: String(raw.roomId),
      tenantId: String(raw.tenantId),
      tenantName: raw.tenantName,
      roomName: raw.roomName,
      startDate: raw.startDate,
      endDate: raw.endDate,
      monthlyRent: Number(raw.monthlyRent),
      deposit: Number(raw.deposit),
      rentDueDay: Number(raw.rentDueDay),
      status: raw.status,
    };
  },
  getSettlementSummary: async (tenancyId: string | number): Promise<SettlementSummary> => {
    return await request<SettlementSummary>(`/tenancies/${tenancyId}/settlement-summary/`);
  },
  settleDeposit: async (tenancyId: string | number, payload: SettleDepositPayload): Promise<Deposit> => {
    const raw = await request<DepositResponse>(`/tenancies/${tenancyId}/settle-deposit/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return formatDeposit(raw);
  },
};

// 4. Rent Charges API
export const rentChargesApi = {
  list: async (params?: { month?: string; roomId?: string | number; tenancyId?: string | number; status?: string }): Promise<RentCharge[]> => {
    const sp = new URLSearchParams();
    if (params?.month) sp.append('month', params.month);
    if (params?.roomId) sp.append('roomId', String(params.roomId));
    if (params?.tenancyId) sp.append('tenancyId', String(params.tenancyId));
    if (params?.status) sp.append('status', params.status);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const raw = await requestAll<ChargeResponse>(`/rent-charges/${qs}`);
    return raw.map((c) => ({
      id: String(c.id),
      tenancyId: String(c.tenancyId),
      roomId: String(c.roomId),
      roomName: c.roomName,
      tenantId: String(c.tenantId),
      tenantName: c.tenantName,
      month: c.month,
      dueDate: c.dueDate,
      amount: Number(c.amount),
      paidAmount: Number(c.paidAmount),
      status: c.status,
      balance: Number(c.balance),
    }));
  },
  generate: async (month: string) => {
    return await request<{
      month: string;
      createdCount: number;
      skippedCount: number;
      totalAmount: number;
      message: string;
      charges: RentCharge[];
    }>('/rent-charges/generate/', {
      method: 'POST',
      body: JSON.stringify({ month }),
    });
  },
};

// 5. Payments API
export const paymentsApi = {
  list: async (params?: {
    method?: string;
    roomId?: string | number;
    tenantId?: string | number;
    tenancyId?: string | number;
    month?: string;
    search?: string;
  }): Promise<Payment[]> => {
    const sp = new URLSearchParams();
    if (params?.method) sp.append('method', params.method);
    if (params?.roomId) sp.append('roomId', String(params.roomId));
    if (params?.tenantId) sp.append('tenantId', String(params.tenantId));
    if (params?.tenancyId) sp.append('tenancyId', String(params.tenancyId));
    if (params?.month) sp.append('month', params.month);
    if (params?.search) sp.append('search', params.search);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const raw = await requestAll<PaymentResponse>(`/payments/${qs}`);
    return raw.map((p) => ({
      id: String(p.id),
      receiptNumber: p.receiptNumber ?? p.receipt_number,
      tenantId: String(p.tenantId),
      tenantName: p.tenantName,
      tenancyId: String(p.tenancyId),
      roomId: String(p.roomId),
      roomName: p.roomName,
      chargeId: p.chargeId == null ? null : String(p.chargeId),
      amount: Number(p.amount),
      date: p.date,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      allocations: p.allocations ?? [],
      reservations: p.reservations ?? [],
      refunds: p.refunds ?? [],
      availableCredit: Number(p.availableCredit ?? 0),
      isReversed: Boolean(p.isReversed),
    }));
  },
  record: async (payload: {
    roomId: string | number;
    amount: number;
    method: string;
    reference: string;
    paymentDate: string;
    chargeId?: string | number;
    chargeMonth?: string;
    tenancyId?: string | number;
    allocationMode?: 'automatic' | 'manual';
    allocations?: Array<{ chargeId: string | number; amount: string | number }>;
    reservations?: Array<{ month: string; amount: string | number }>;
    notes?: string;
  }): Promise<Payment> => {
    const raw = await request<PaymentResponse>('/payments/', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        roomId: Number(payload.roomId),
        tenancyId: payload.tenancyId ? Number(payload.tenancyId) : undefined,
        chargeId: payload.chargeId ? Number(payload.chargeId) : undefined,
        allocations: payload.allocations?.map((item) => ({
          chargeId: Number(item.chargeId),
          amount: String(item.amount),
        })),
        reservations: payload.reservations?.map((item) => ({
          month: item.month,
          amount: String(item.amount),
        })),
      }),
    });
    return {
      id: String(raw.id),
      receiptNumber: raw.receiptNumber,
      tenantId: String(raw.tenantId),
      tenantName: raw.tenantName,
      tenancyId: String(raw.tenancyId),
      roomId: String(raw.roomId),
      roomName: raw.roomName,
      chargeId: raw.chargeId == null ? null : String(raw.chargeId),
      amount: Number(raw.amount),
      date: raw.date,
      method: raw.method,
      reference: raw.reference,
      notes: raw.notes,
      allocations: raw.allocations ?? [],
      reservations: raw.reservations ?? [],
      refunds: raw.refunds ?? [],
      availableCredit: Number(raw.availableCredit ?? 0),
      isReversed: Boolean(raw.isReversed),
    };
  },
  getReceipt: async (paymentId: string | number): Promise<ReceiptData> => {
    return await request<ReceiptData>(`/payments/${paymentId}/receipt/`);
  },
};

function formatDeposit(raw: DepositResponse): Deposit {
  return {
    id: String(raw.id),
    tenancyId: String(raw.tenancyId),
    tenantId: raw.tenantId ? String(raw.tenantId) : undefined,
    tenantName: raw.tenantName || 'Tenant',
    tenantPhone: raw.tenantPhone,
    roomId: raw.roomId ? String(raw.roomId) : undefined,
    roomName: raw.roomName || 'Room',
    roomNumber: raw.roomNumber,
    requiredAmount: Number(raw.requiredAmount ?? raw.amount ?? 0),
    amount: Number(raw.amount),
    totalPaid: Number(raw.totalPaid ?? raw.amount ?? 0),
    outstandingBalance: Number(raw.outstandingBalance ?? 0),
    isWaived: Boolean(raw.isWaived),
    waivedReason: raw.waivedReason || '',
    waivedAt: raw.waivedAt,
    receivedDate: raw.receivedDate || raw.received_date,
    status: raw.status,
    reference: raw.reference || '',
    notes: raw.notes || '',
    rentDeducted: Number(raw.rentDeducted || 0),
    repairsDeducted: Number(raw.repairsDeducted || 0),
    totalDeductions: Number(raw.totalDeductions || (Number(raw.rentDeducted || 0) + Number(raw.repairsDeducted || 0))),
    refundableBalance: Number(raw.refundableBalance ?? Math.max(0, Number(raw.amount) - (Number(raw.rentDeducted || 0) + Number(raw.repairsDeducted || 0)))),
    refundAmount: Number(raw.refundAmount || 0),
    refundMethod: raw.refundMethod,
    refundReference: raw.refundReference,
    refundDate: raw.refundDate,
    settledAt: raw.settledAt,
    settlementNotes: raw.settlementNotes,
    deductions: (raw.deductions || []).map((d) => ({
      id: d.id,
      deductionType: d.deductionType || d.deduction_type,
      description: d.description,
      amount: Number(d.amount),
      chargeId: d.chargeId,
      chargeMonth: d.chargeMonth,
      createdAt: d.created_at || d.createdAt,
    })),
    payments: (raw.payments || []).map((p) => ({
      id: p.id,
      depositId: p.depositId || raw.id,
      amount: Number(p.amount),
      paymentDate: p.paymentDate || p.payment_date,
      method: p.method,
      reference: p.reference || '',
      notes: p.notes || '',
      createdAt: p.created_at || p.createdAt,
    })),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

// 5b. Deposits API
export const depositsApi = {
  list: async (params?: { status?: string; tenancyId?: string | number; tenantId?: string | number; roomId?: string | number; search?: string }): Promise<Deposit[]> => {
    const sp = new URLSearchParams();
    if (params?.status) sp.append('status', params.status);
    if (params?.tenancyId) sp.append('tenancyId', String(params.tenancyId));
    if (params?.tenantId) sp.append('tenantId', String(params.tenantId));
    if (params?.roomId) sp.append('roomId', String(params.roomId));
    if (params?.search) sp.append('search', params.search);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const raw = await requestAll<DepositResponse>(`/deposits/${qs}`);
    return raw.map(formatDeposit);
  },
  get: async (depositId: string | number): Promise<Deposit> => {
    const raw = await request<DepositResponse>(`/deposits/${depositId}/`);
    return formatDeposit(raw);
  },
  recordPayment: async (depositId: string | number, payload: {
    amount: number;
    paymentDate: string;
    method?: string;
    reference?: string;
    notes?: string;
  }): Promise<Deposit> => {
    const raw = await request<DepositResponse>(`/deposits/${depositId}/record-payment/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return formatDeposit(raw);
  },
  settle: async (depositId: string | number, payload: SettleDepositPayload): Promise<Deposit> => {
    const raw = await request<DepositResponse>(`/deposits/${depositId}/settle/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return formatDeposit(raw);
  },
};

// 6. Expenses API
export const expensesApi = {
  list: async (params?: { category?: string; month?: string; startDate?: string; endDate?: string }): Promise<Expense[]> => {
    const sp = new URLSearchParams();
    if (params?.category) sp.append('category', params.category);
    if (params?.month) sp.append('month', params.month);
    if (params?.startDate) sp.append('startDate', params.startDate);
    if (params?.endDate) sp.append('endDate', params.endDate);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const raw = await requestAll<ExpenseResponse>(`/expenses/${qs}`);
    return raw.map((e) => ({
      id: String(e.id),
      category: e.category,
      title: e.title,
      amount: Number(e.amount),
      date: e.date,
      method: e.method,
      reference: e.reference,
      description: e.description,
      property: e.propertyName || 'Kimumu Rentals',
    }));
  },
  create: async (payload: {
    category: string;
    title: string;
    amount: number;
    date: string;
    method: string;
    reference?: string;
    description?: string;
  }): Promise<Expense> => {
    const raw = await request<ExpenseResponse>('/expenses/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      id: String(raw.id),
      category: raw.category,
      title: raw.title,
      amount: Number(raw.amount),
      date: raw.date,
      method: raw.method,
      reference: raw.reference,
      description: raw.description,
      property: raw.propertyName || 'Kimumu Rentals',
    };
  },
};

// 7. Reports & Dashboard API
export const reportsApi = {
  getDashboardMetrics: async (month?: string): Promise<DashboardMetrics> => {
    const qs = month ? `?month=${month}` : '';
    return await request<DashboardMetrics>(`/dashboard/metrics/${qs}`);
  },
  getMonthlyReport: async (month?: string): Promise<MonthlyFinancialReport> => {
    const qs = month ? `?month=${month}` : '';
    return await request<MonthlyFinancialReport>(`/reports/monthly/${qs}`);
  },
};

// 8. Settings API
export const settingsApi = {
  get: async (): Promise<PropertySettings> => {
    const raw = await request<SettingsResponse>('/settings/');
    return {
      propertyName: raw.propertyName,
      location: raw.location,
      landlordName: raw.landlordName,
      landlordInitials: raw.landlordInitials,
      landlordPhone: raw.landlordPhone || '',
      landlordEmail: raw.landlordEmail || '',
      currency: raw.currency,
      defaultDueDay: Number(raw.defaultDueDay),
      autoGenerateCharges: Boolean(raw.autoGenerateCharges),
      roomRents: raw.roomRents || {},
    };
  },
  update: async (payload: Partial<PropertySettings>): Promise<PropertySettings> => {
    const raw = await request<SettingsResponse>('/settings/', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return {
      propertyName: raw.propertyName,
      location: raw.location,
      landlordName: raw.landlordName,
      landlordInitials: raw.landlordInitials,
      landlordPhone: raw.landlordPhone || '',
      landlordEmail: raw.landlordEmail || '',
      currency: raw.currency,
      defaultDueDay: Number(raw.defaultDueDay),
      autoGenerateCharges: Boolean(raw.autoGenerateCharges),
      roomRents: raw.roomRents || {},
    };
  },
};
