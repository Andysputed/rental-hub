import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, AlertCircle, ArrowDownLeft, FileText } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { MonthSelector } from '../components/common/MonthSelector';
import { RoomBadge } from '../components/common/RoomBadge';
import { formatKSh, formatDateShort } from '../utils/format';
import { getWhatsAppNumber } from '../utils/phone';
import { generateRentReminder } from '../utils/messages';

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
              {overdueItems.map((item) => {
                const waNumber = getWhatsAppNumber(item.tenantPhone);
                const reminderMsg =
                  item.tenantName && item.tenantPhone
                    ? generateRentReminder({
                        tenantName: item.tenantName,
                        roomName: item.roomName,
                        propertyName: settings.propertyName,
                        totalBalance: item.balance,
                        charges: [{ month: item.month, balance: item.balance, dueDate: item.dueDate }],
                        landlordName: settings.landlordName,
                        landlordPhone: settings.landlordPhone || undefined,
                      })
                    : null;
                const waHref = waNumber && reminderMsg
                  ? `https://wa.me/${waNumber}?text=${encodeURIComponent(reminderMsg)}`
                  : undefined;

                return (
                  <div key={item.id} className="py-2.5 flex items-center justify-between">
                    <div
                      className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() =>
                        navigate(
                          item.isFormerTenant && item.tenantId
                            ? `/tenants/${item.tenantId}`
                            : `/rooms/${item.roomId}`
                        )
                      }
                    >
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
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <div className="text-sm font-bold text-amber-text">{formatKSh(item.balance)}</div>
                      {waHref && (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Send WhatsApp rent reminder"
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
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
