import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, ArrowRight } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { MonthSelector } from '../components/common/MonthSelector';
import { RoomBadge } from '../components/common/RoomBadge';
import { formatKSh, formatDateShort } from '../utils/format';

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    settings,
    rooms,
    expenses,
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

  const currentMonthExpenses = expenses.filter((e) => e.date.startsWith(selectedMonth));
  const overdueItems = getOverdueCharges();
  const collectionRate = totalRentCharged > 0 ? Math.round((totalRentReceived / totalRentCharged) * 100) : 0;

  const handleExport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Mobile back button */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="md:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
      >
        <ArrowLeft size={16} />
        <span>More</span>
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            <span className="md:hidden">Monthly report</span>
            <span className="hidden md:inline">October financial report</span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="md:hidden">{settings.propertyName} · As of 19 October 2026</span>
            <span className="hidden md:inline">
              {settings.propertyName}, Nairobi · Cash-basis results for 1–19 October 2026.
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-brand-700 text-brand-700 md:bg-brand-700 md:text-white md:hover:bg-[#0D3F34] hover:bg-emerald-50 text-sm font-semibold shadow-2xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download size={18} />
          <span>
            <span className="md:hidden">Export October report</span>
            <span className="hidden md:inline">Export report</span>
          </span>
        </button>
      </div>

      {/* Month Switcher row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <MonthSelector currentMonth={selectedMonth} onChange={setSelectedMonth} className="w-full sm:w-64" />
        <span className="hidden md:inline text-xs text-gray-500 font-medium">
          Month to date · Kenyan Shillings (KES)
        </span>
      </div>

      {/* Mobile Hero Card: Net Cash Income */}
      <div className="md:hidden rounded-2xl p-5 bg-brand-700 text-white shadow-2xs space-y-1">
        <div className="text-xs font-medium text-emerald-200">Net cash income · Month to date</div>
        <div className="text-3xl font-bold tracking-tight">{formatKSh(netCashIncome)}</div>
        <div className="text-xs text-emerald-100/90 pt-1">
          {formatKSh(totalRentReceived)} received - {formatKSh(totalExpenses)} expenses
        </div>
      </div>

      {/* Desktop Top Metric Cards */}
      <div className="hidden md:grid grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Rent charged</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatKSh(totalRentCharged)}</div>
          <div className="text-xs text-gray-400 mt-2">5 occupied rooms</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Rent received</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatKSh(totalRentReceived)}</div>
          <div className="text-xs text-emerald-600 font-medium mt-2">{collectionRate}% collected</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Outstanding rent</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatKSh(totalOutstanding)}</div>
          <div className="text-xs text-amber-text font-medium mt-2">{overdueItems.length} overdue balances</div>
        </div>

        <div className="bg-brand-700 text-white rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-emerald-200 font-medium">Net cash income</div>
          <div className="text-2xl font-bold mt-1">{formatKSh(netCashIncome)}</div>
          <div className="text-xs text-emerald-100 mt-2">After {formatKSh(totalExpenses)} expenses</div>
        </div>
      </div>

      {/* Middle Section: Cash Movement / Rent Position & Occupancy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mobile Rent Position Card */}
        <div className="md:hidden bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Rent position</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-100 text-gray-600">
              <span>Rent charged · 5 rooms</span>
              <span className="font-semibold text-gray-900">{formatKSh(totalRentCharged)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100 text-gray-600">
              <span>Rent received</span>
              <span className="font-semibold text-brand-700">{formatKSh(totalRentReceived)}</span>
            </div>
            <div className="flex justify-between py-1 text-gray-600">
              <span>Outstanding rent</span>
              <span className="font-semibold text-gray-900">{formatKSh(totalOutstanding)}</span>
            </div>
          </div>
          <div className="text-xs text-amber-text font-medium pt-1">
            3 overdue balances · Due 5 October 2026
          </div>
        </div>

        {/* Cash movement visual bar card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              <span className="md:hidden">Cash movement</span>
              <span className="hidden md:inline">From rent received to cash income</span>
            </h2>
            <div className="hidden md:flex items-center gap-4 text-xs text-gray-500 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand-700" />
                <span>Rent received</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-gray-400" />
                <span>Expenses</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-800" />
                <span>Net cash income</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between text-gray-600 mb-1">
                <span>Rent received</span>
                <span className="font-semibold text-gray-900">{formatKSh(totalRentReceived)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className="bg-brand-700 h-3 rounded-full w-full" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-gray-600 mb-1">
                <span className="md:hidden">Expenses</span>
                <span className="hidden md:inline">Less expenses</span>
                <span className="font-semibold text-gray-900">
                  <span className="hidden md:inline">-</span> {formatKSh(totalExpenses)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-gray-400 h-3 rounded-full"
                  style={{ width: `${(totalExpenses / totalRentReceived) * 100}%` }}
                />
              </div>
            </div>

            <div className="hidden md:block pt-2 border-t border-gray-100">
              <div className="flex justify-between text-gray-900 font-bold mb-1">
                <span>Net cash income</span>
                <span>{formatKSh(netCashIncome)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-emerald-800 h-3 rounded-full"
                  style={{ width: `${(netCashIncome / totalRentReceived) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
            <span className="md:hidden">Actual cash in and out · KSh · 1–19 October</span>
            <span className="hidden md:inline">
              Net cash income uses rent actually received, not rent charged. Deposits are excluded.
            </span>
          </div>
        </div>

        {/* Occupancy & Rent Potential Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">
              <span className="md:hidden">Occupancy</span>
              <span className="hidden md:inline">Occupancy & rent potential</span>
            </h2>
            <span className="text-xs text-gray-500">{occupancyPercentage}% occupancy</span>
          </div>

          <div className="text-sm font-bold text-gray-900">
            {occupancyCount} of {rooms.length} occupied
          </div>

          {/* 6 room badges */}
          <div className="grid grid-cols-6 gap-2 my-2">
            {rooms.map((room) => (
              <RoomBadge
                key={room.id}
                number={room.number}
                isOccupied={room.status === 'occupied'}
                onClick={() => navigate('/rooms')}
              />
            ))}
          </div>

          <div className="text-xs text-gray-600">
            <span className="font-semibold text-gray-900">Room 06 is vacant</span> · KSh 10,000 / month
          </div>

          <div className="space-y-1.5 text-xs pt-2 border-t border-gray-100">
            <div className="flex justify-between text-gray-600">
              <span>Occupied rent charged</span>
              <span className="font-semibold text-gray-900">{formatKSh(totalRentCharged)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Potential at full occupancy</span>
              <span className="font-semibold text-gray-900">KSh 60,000</span>
            </div>
          </div>

          <div className="hidden md:block pt-2">
            <span className="inline-block px-3 py-1 bg-[#EBF5F0] text-brand-700 font-semibold text-xs rounded-full">
              83% occupied · 5 of 6 rooms
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Expense Breakdown & Outstanding Rent */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expense Breakdown Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Expense breakdown</h2>
            <button
              onClick={() => navigate('/expenses')}
              className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View expenses</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            {currentMonthExpenses.map((exp) => (
              <div key={exp.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{exp.title}</div>
                  <div className="text-[11px] text-gray-400 capitalize">
                    {exp.category} · {formatDateShort(exp.date)}
                  </div>
                </div>
                <div className="font-bold text-gray-900">{formatKSh(exp.amount)}</div>
              </div>
            ))}

            <div className="pt-3 flex justify-between font-bold text-xs text-gray-900">
              <span>Total property expenses</span>
              <span>{formatKSh(totalExpenses)}</span>
            </div>
          </div>
        </div>

        {/* Outstanding Rent Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-3">
          <h2 className="text-base font-bold text-gray-900">Outstanding rent</h2>
          <div className="text-xs text-amber-text font-medium">
            Due 5 October · 14 days overdue
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            {overdueItems.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{item.tenantName}</div>
                  <div className="text-[11px] text-gray-500">
                    {item.roomName} · Paid {formatKSh(item.paidAmount)} of {formatKSh(item.amount)}
                  </div>
                </div>
                <div className="font-bold text-amber-text">{formatKSh(item.balance)}</div>
              </div>
            ))}

            <div className="pt-3 flex justify-between font-bold text-xs text-gray-900">
              <span>Total outstanding</span>
              <span className="text-amber-text">{formatKSh(totalOutstanding)}</span>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 pt-1">
            These balances are not included in received cash or net cash income.
          </div>
        </div>
      </div>

      <div className="text-[11px] text-gray-400 text-center pb-2">
        Cash-basis report. Outstanding rent is not cash received. Deposits are excluded from rent income.
      </div>
    </div>
  );
};
