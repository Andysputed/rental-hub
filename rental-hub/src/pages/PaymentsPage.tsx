import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, ChevronRight } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { MonthSelector } from '../components/common/MonthSelector';
import { Badge } from '../components/common/Badge';
import { formatKSh, formatDateShort } from '../utils/format';
import type { PaymentMethod } from '../types';

export const PaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { payments, rooms, tenants, selectedMonth, setSelectedMonth, totalRentReceived, totalOutstanding } =
    useRental();

  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');

  const filteredPayments = payments.filter((p) => {
    if (methodFilter === 'all') return true;
    return p.method === methodFilter;
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">A clear record of every rent payment</p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/payments/record')}
          className="hidden sm:inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-700 hover:bg-[#0D3F34] text-white text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <Plus size={18} />
          <span>Record payment</span>
        </button>
      </div>

      {/* Month Switcher */}
      <MonthSelector currentMonth={selectedMonth} onChange={setSelectedMonth} />

      {/* Summary Card */}
      <div className="bg-[#EBF5F0]/60 border border-[#CDE5DA] rounded-2xl p-5 shadow-2xs">
        <div className="text-xs font-semibold text-brand-700">October rent received</div>
        <div className="text-3xl font-bold text-gray-900 mt-1">{formatKSh(totalRentReceived)}</div>
        <div className="text-xs text-gray-600 mt-2">
          {payments.length} payments · {formatKSh(totalOutstanding)} still outstanding
        </div>
      </div>

      {/* Mobile Record Payment Button */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => navigate('/payments/record')}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs cursor-pointer"
        >
          <Plus size={18} />
          <span>Record payment</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMethodFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            methodFilter === 'all'
              ? 'bg-brand-700 text-white font-semibold'
              : 'bg-white text-gray-600 border border-[#E5E7EB] hover:bg-gray-50'
          }`}
        >
          All · {payments.length}
        </button>
        <button
          onClick={() => setMethodFilter('mpesa')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            methodFilter === 'mpesa'
              ? 'bg-brand-700 text-white font-semibold'
              : 'bg-white text-gray-600 border border-[#E5E7EB] hover:bg-gray-50'
          }`}
        >
          M-Pesa
        </button>
        <button
          onClick={() => setMethodFilter('cash')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            methodFilter === 'cash'
              ? 'bg-brand-700 text-white font-semibold'
              : 'bg-white text-gray-600 border border-[#E5E7EB] hover:bg-gray-50'
          }`}
        >
          Cash
        </button>
        <button
          onClick={() => setMethodFilter('bank')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            methodFilter === 'bank'
              ? 'bg-brand-700 text-white font-semibold'
              : 'bg-white text-gray-600 border border-[#E5E7EB] hover:bg-gray-50'
          }`}
        >
          Bank
        </button>
      </div>

      {/* List Header */}
      <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
        <span>October payments</span>
        <span>Newest first</span>
      </div>

      {/* Payment Cards */}
      <div className="space-y-3">
        {filteredPayments.map((p) => {
          const tenant = tenants.find((t) => t.id === p.tenantId);
          const room = rooms.find((r) => r.id === p.roomId);

          return (
            <div
              key={p.id}
              className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 hover:border-gray-300 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">{formatKSh(p.amount)}</span>
                <Badge variant={p.method === 'mpesa' ? 'mpesa' : p.method === 'cash' ? 'cash' : 'bank'}>
                  {p.method === 'mpesa' ? 'M-Pesa' : p.method === 'cash' ? 'Cash' : 'Bank transfer'}
                </Badge>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {tenant?.fullName} · {room?.name}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                  <span>{formatDateShort(p.date)}</span>
                  <span className="font-mono text-gray-700">{p.reference}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => navigate(`/payments/receipt/${p.id}`)}
                  className="w-full flex items-center justify-between py-1 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <FileText size={15} />
                    <span>Receipt {p.receiptNumber}</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-gray-400 text-center pb-2">
        All {payments.length} payments shown · Amounts in KSh
      </div>
    </div>
  );
};
