import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, AlertCircle, ArrowDownLeft, FileText } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { MonthSelector } from '../components/common/MonthSelector';
import { RoomBadge } from '../components/common/RoomBadge';
import { formatKSh, formatDateShort } from '../utils/format';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    settings,
    rooms,
    tenants,
    payments,
    selectedMonth,
    setSelectedMonth,
    totalRentCharged,
    totalRentReceived,
    totalOutstanding,
    totalExpenses,
    netCashIncome,
    occupancyCount,
    occupancyPercentage,
    getOverdueCharges,
  } = useRental();

  const collectionRate = totalRentCharged > 0 ? Math.round((totalRentReceived / totalRentCharged) * 100) : 0;
  const overdueItems = getOverdueCharges();
  const recentPayments = payments.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            <span className="md:hidden">Your property, at a glance</span>
            <span className="hidden md:inline">A clear view of your property</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="md:hidden">{settings.propertyName}, Nairobi · 19 October 2026</span>
            <span className="hidden md:inline">October's rent, rooms and cash flow — all in one place.</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/payments/record')}
          className="hidden md:inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-700 hover:bg-[#0D3F34] text-white text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <Plus size={18} />
          <span>Record payment</span>
        </button>
      </div>

      {/* Date Switcher row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <MonthSelector currentMonth={selectedMonth} onChange={setSelectedMonth} className="w-full sm:w-64" />
        <span className="hidden md:inline text-xs text-gray-500 font-medium">
          {settings.propertyName}, Nairobi · 6 rooms · KES
        </span>
      </div>

      {/* Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Hero Card - Rent Received */}
        <div className="rounded-2xl p-5 bg-brand-700 text-white flex flex-col justify-between shadow-2xs">
          <div>
            <div className="text-xs font-medium text-emerald-200">October rent received</div>
            <div className="text-3xl font-bold mt-1 tracking-tight">{formatKSh(totalRentReceived)}</div>
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-800/60">
            <div className="flex items-center justify-between text-xs text-emerald-100 mb-1.5">
              <span>Rent collection</span>
              <span className="font-semibold">{collectionRate}%</span>
            </div>
            <div className="w-full bg-emerald-950/50 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-300 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, collectionRate)}%` }}
              />
            </div>
            <div className="text-[11px] text-emerald-200/80 mt-1.5">
              {formatKSh(totalRentReceived)} of {formatKSh(totalRentCharged)} charged
            </div>
          </div>
        </div>

        {/* Outstanding Rent Card */}
        <div className="rounded-2xl p-5 bg-white border border-[#E5E7EB] flex flex-col justify-between shadow-2xs">
          <div>
            <div className="text-xs font-medium text-gray-500">Outstanding rent</div>
            <div className="text-3xl font-bold mt-1 tracking-tight text-gray-900">
              {Math.round(totalOutstanding).toLocaleString('en-KE')}
            </div>
          </div>
          <div className="text-xs text-amber-text font-medium mt-3">
            KSh · {overdueItems.length} overdue
          </div>
        </div>

        {/* Expenses Card */}
        <div className="hidden sm:flex rounded-2xl p-5 bg-white border border-[#E5E7EB] flex-col justify-between shadow-2xs">
          <div>
            <div className="text-xs font-medium text-gray-500">Property expenses</div>
            <div className="text-3xl font-bold mt-1 tracking-tight text-gray-900">
              {formatKSh(totalExpenses)}
            </div>
          </div>
          <div className="text-xs text-gray-500 font-medium mt-3">
            4 expenses this month
          </div>
        </div>

        {/* Net Cash Income Card */}
        <div className="rounded-2xl p-5 bg-white border border-[#E5E7EB] flex flex-col justify-between shadow-2xs">
          <div>
            <div className="text-xs font-medium text-gray-500">Net cash income</div>
            <div className="text-3xl font-bold mt-1 tracking-tight text-gray-900">
              {Math.round(netCashIncome).toLocaleString('en-KE')}
            </div>
          </div>
          <div className="text-xs text-gray-500 font-medium mt-3">
            KSh · after expenses
          </div>
        </div>
      </div>

      {/* Mobile-only Expenses line & Record button */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-600 px-1 font-medium">
          <span>October property expenses</span>
          <span className="font-semibold text-gray-900">{formatKSh(totalExpenses)}</span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/payments/record')}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs cursor-pointer"
        >
          <Plus size={18} />
          <span>Record payment</span>
        </button>
      </div>

      {/* Middle Section: Rent Collection & Occupancy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Desktop-only Collection Card with Circular Donut */}
        <div className="hidden md:flex rounded-2xl p-6 bg-white border border-[#E5E7EB] flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">October rent collection</h2>
            <button
              onClick={() => navigate('/rent-charges')}
              className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View rent charges</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="flex items-center gap-6 my-4">
            {/* Donut progress visual */}
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-gray-100"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-brand-700"
                  strokeDasharray={`${collectionRate}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-xl font-bold text-gray-900">{collectionRate}%</span>
                <span className="text-[10px] text-gray-500">collected</span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="flex-1 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">Rent charged</span>
                <span className="font-semibold text-gray-900">{formatKSh(totalRentCharged)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">Rent received</span>
                <span className="font-semibold text-brand-700">{formatKSh(totalRentReceived)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Outstanding rent</span>
                <span className="font-semibold text-gray-900">{formatKSh(totalOutstanding)}</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 pt-2 border-t border-gray-100">
            All 5 occupied rooms charged · Due 5 October
          </div>
        </div>

        {/* Room Occupancy Card */}
        <div className="rounded-2xl p-5 sm:p-6 bg-white border border-[#E5E7EB] flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Room occupancy</h2>
            <button
              onClick={() => navigate('/rooms')}
              className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span className="md:hidden">View rooms</span>
              <span className="hidden md:inline">Manage rooms</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="my-3">
            <div className="flex items-center justify-between text-xs font-medium mb-3">
              <span className="text-sm font-bold text-gray-900">
                {occupancyCount} of {rooms.length} occupied
              </span>
              <span className="text-gray-500">{occupancyPercentage}% occupancy</span>
            </div>

            {/* 6 Room Badges */}
            <div className="grid grid-cols-6 gap-2">
              {rooms.map((room) => (
                <RoomBadge
                  key={room.id}
                  number={room.number}
                  isOccupied={room.status === 'occupied'}
                  onClick={() => navigate('/rooms')}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1 pt-2 border-t border-gray-100 text-xs text-gray-600">
            <div>
              <span className="text-gray-800 font-medium">Room 06 is vacant</span> · KSh 10,000 / month
            </div>
            <div className="hidden md:flex justify-between text-gray-500 pt-1">
              <span>Occupied monthly rent</span>
              <span className="font-semibold text-gray-900">{formatKSh(totalRentCharged)}</span>
            </div>
            <div className="hidden md:block text-[11px] text-gray-400">
              Room 06 is ready for a tenant. Potential rent at full occupancy: KSh 60,000.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Payments & Needs Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Payments (2 cols on desktop) */}
        <div className="lg:col-span-2 rounded-2xl p-5 sm:p-6 bg-white border border-[#E5E7EB] shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Recent payments</h2>
            <button
              onClick={() => navigate('/payments')}
              className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span className="md:hidden">View all</span>
              <span className="hidden md:inline">All payments</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Mobile list view */}
          <div className="md:hidden divide-y divide-gray-100">
            {recentPayments.map((p) => {
              const tenant = tenants.find((t) => t.id === p.tenantId);
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/payments/receipt/${p.id}`)}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#EBF5F0] text-brand-700 flex items-center justify-center">
                      <ArrowDownLeft size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{tenant?.fullName}</div>
                      <div className="text-xs text-gray-500">
                        {formatDateShort(p.date)} · {p.method === 'mpesa' ? 'M-Pesa' : p.method === 'cash' ? 'Cash' : 'Bank'}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-gray-900">{formatKSh(p.amount)}</div>
                </div>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-semibold uppercase tracking-wider">
                  <th className="pb-3">Tenant / Room</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Method</th>
                  <th className="pb-3 text-right">Amount (KSh)</th>
                  <th className="pb-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentPayments.map((p) => {
                  const tenant = tenants.find((t) => t.id === p.tenantId);
                  const room = rooms.find((r) => r.id === p.roomId);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/payments/receipt/${p.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3">
                        <div className="font-semibold text-gray-900">{tenant?.fullName}</div>
                        <div className="text-[11px] text-gray-400">{room?.name}</div>
                      </td>
                      <td className="py-3 text-gray-600">{formatDateShort(p.date)}</td>
                      <td className="py-3 text-gray-600 capitalize">
                        {p.method === 'mpesa' ? 'M-Pesa' : p.method === 'cash' ? 'Cash' : 'Bank transfer'}
                      </td>
                      <td className="py-3 text-right font-bold text-gray-900">
                        {Math.round(p.amount).toLocaleString('en-KE')}
                      </td>
                      <td className="py-3 text-right">
                        <span className="inline-flex text-brand-700 hover:text-[#0D3F34] p-1">
                          <FileText size={16} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Needs Attention Card */}
        <div className="rounded-2xl p-5 sm:p-6 bg-white border border-[#E5E7EB] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900">Needs attention</h2>
              <button
                onClick={() => navigate('/rent-charges')}
                className="md:hidden text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Rent charges</span>
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-amber-text bg-amber-border/60 border border-[#FDE68A] rounded-lg p-2.5 mb-3">
              <AlertCircle size={16} className="text-amber-text shrink-0" />
              <span>{overdueItems.length} {overdueItems.length === 1 ? 'balance' : 'balances'} overdue · due 5 October</span>
            </div>

            <div className="divide-y divide-gray-100">
              {overdueItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigate(item.isFormerTenant && item.tenantId ? `/tenants/${item.tenantId}` : `/rooms/${item.roomId}`)}
                  className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-1 px-1 rounded transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900">{item.tenantName}</span>
                      {item.isFormerTenant && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                          Former
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.roomName} · <span className="text-gray-400">{item.paidAmount > 0 ? 'Part paid' : 'Unpaid'}</span>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-amber-text">{formatKSh(item.balance)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden md:block pt-4 border-t border-gray-100 mt-4">
            <button
              type="button"
              onClick={() => navigate('/rent-charges')}
              className="w-full py-2.5 px-3 rounded-lg border border-[#E5E7EB] hover:bg-gray-50 text-xs font-semibold text-gray-800 transition-colors cursor-pointer"
            >
              Review rent charges
            </button>
          </div>
        </div>
      </div>

      {/* Quick Links on Mobile */}
      <div className="md:hidden flex items-center justify-between px-2 pt-2 text-xs font-medium text-brand-700">
        <button onClick={() => navigate('/rent-charges')} className="hover:underline flex items-center gap-0.5">
          <span>Rent charges</span>
          <ArrowRight size={14} />
        </button>
        <button onClick={() => navigate('/expenses')} className="hover:underline flex items-center gap-0.5">
          <span>Expenses</span>
          <ArrowRight size={14} />
        </button>
        <button onClick={() => navigate('/settings')} className="hover:underline flex items-center gap-0.5">
          <span>Settings</span>
          <ArrowRight size={14} />
        </button>
      </div>

      <div className="text-[11px] text-gray-400 text-center pb-2">
        Month to date · 1–19 October 2026. Deposits are excluded from rent received and net cash income.
      </div>
    </div>
  );
};
