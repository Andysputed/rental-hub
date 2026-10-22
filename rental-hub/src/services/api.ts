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
} from '../types';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorData: any = null;
      let errorMsg = `API request failed with status ${response.status}`;
      try {
        errorData = await response.json();
        if (typeof errorData === 'object' && errorData !== null) {
          if (errorData.error) {
            errorMsg = errorData.error;
          } else if (errorData.detail) {
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
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      err?.message || 'Network connection failed. Please check if the Django backend server is running.',
      0
    );
  }
}

// 1. Rooms API
export const roomsApi = {
  list: async (status?: 'occupied' | 'vacant'): Promise<Room[]> => {
    const query = status ? `?status=${status}` : '';
    const rawRooms = await request<any[]>(`/rooms/${query}`);
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
    const r = await request<any>(`/rooms/${id}/`);
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
    const raw = await request<any[]>(`/tenants/${qs}`);
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
    const t = await request<any>(`/tenants/${id}/`);
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
    const raw = await request<any[]>(`/tenancies/${qs}`);
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
    deposit?: number;
    rentDueDay?: number;
  }): Promise<Tenancy> => {
    const raw = await request<any>('/tenancies/register/', {
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
  moveOut: async (tenancyId: string | number, payload: { endDate: string; notes?: string }): Promise<Tenancy> => {
    const raw = await request<any>(`/tenancies/${tenancyId}/move-out/`, {
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
    const raw = await request<any[]>(`/rent-charges/${qs}`);
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
      charges: any[];
    }>('/rent-charges/generate/', {
      method: 'POST',
      body: JSON.stringify({ month }),
    });
  },
};

// 5. Payments API
export const paymentsApi = {
  list: async (params?: { method?: string; roomId?: string | number; search?: string }): Promise<Payment[]> => {
    const sp = new URLSearchParams();
    if (params?.method) sp.append('method', params.method);
    if (params?.roomId) sp.append('roomId', String(params.roomId));
    if (params?.search) sp.append('search', params.search);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    const raw = await request<any[]>(`/payments/${qs}`);
    return raw.map((p) => ({
      id: String(p.id),
      receiptNumber: p.receiptNumber ?? p.receipt_number,
      tenantId: String(p.tenantId),
      tenantName: p.tenantName,
      tenancyId: String(p.tenancyId),
      roomId: String(p.roomId),
      roomName: p.roomName,
      chargeId: String(p.chargeId),
      amount: Number(p.amount),
      date: p.date,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
    }));
  },
  record: async (payload: {
    roomId: string | number;
    amount: number;
    method: string;
    reference: string;
    paymentDate: string;
    chargeId?: string | number;
    notes?: string;
  }): Promise<Payment> => {
    const raw = await request<any>('/payments/', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        roomId: Number(payload.roomId),
        chargeId: payload.chargeId ? Number(payload.chargeId) : undefined,
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
      chargeId: String(raw.chargeId),
      amount: Number(raw.amount),
      date: raw.date,
      method: raw.method,
      reference: raw.reference,
      notes: raw.notes,
    };
  },
  getReceipt: async (paymentId: string | number): Promise<ReceiptData> => {
    return await request<ReceiptData>(`/payments/${paymentId}/receipt/`);
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
    const raw = await request<any[]>(`/expenses/${qs}`);
    return raw.map((e) => ({
      id: String(e.id),
      category: e.category,
      title: e.title,
      amount: Number(e.amount),
      date: e.date,
      method: e.method,
      reference: e.reference,
      description: e.description,
      property: e.propertyName || 'Acacia House',
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
    const raw = await request<any>('/expenses/', {
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
      property: raw.propertyName || 'Acacia House',
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
    const raw = await request<any>('/settings/');
    return {
      propertyName: raw.propertyName,
      location: raw.location,
      landlordName: raw.landlordName,
      landlordInitials: raw.landlordInitials,
      currency: raw.currency,
      defaultDueDay: Number(raw.defaultDueDay),
      autoGenerateCharges: Boolean(raw.autoGenerateCharges),
      roomRents: raw.roomRents || {},
    };
  },
  update: async (payload: Partial<PropertySettings>): Promise<PropertySettings> => {
    const raw = await request<any>('/settings/', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return {
      propertyName: raw.propertyName,
      location: raw.location,
      landlordName: raw.landlordName,
      landlordInitials: raw.landlordInitials,
      currency: raw.currency,
      defaultDueDay: Number(raw.defaultDueDay),
      autoGenerateCharges: Boolean(raw.autoGenerateCharges),
      roomRents: raw.roomRents || {},
    };
  },
};
