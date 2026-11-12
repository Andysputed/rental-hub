import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, ArrowRight } from 'lucide-react';
import { useRental } from '../context/useRental';
import { MonthSelector } from '../components/common/MonthSelector';
import { RoomBadge } from '../components/common/RoomBadge';
import { formatKSh, formatDateShort, formatMonthYear, formatMonthShort } from '../utils/format';
import { reportsApi } from '../services/api';
import type { MonthlyFinancialReport } from '../types';

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    settings,
    rooms,
    rentCharges,
    expenses,
    selectedMonth,
    setSelectedMonth,
    totalRentCharged,
    totalRentReceived,
    totalOutstanding,
    totalExpenses,
    occupancyCount,
    occupancyPercentage,
    isLoading: isContextLoading,
    getOverdueCharges,
  } = useRental();

  const [monthlyReport, setMonthlyReport] = useState<MonthlyFinancialReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsReportLoading(true);
      setReportError(null);
      void reportsApi.getMonthlyReport(selectedMonth)
      .then((report) => {
        if (!cancelled) setMonthlyReport(report);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setReportError(error instanceof Error ? error.message : 'Could not load monthly report data.');
        setMonthlyReport(null);
      })
      .finally(() => {
        if (!cancelled) setIsReportLoading(false);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const currentMonthExpenses = expenses.filter((e) => e.date.startsWith(selectedMonth));
  const currentMonthCharges = rentCharges.filter((charge) => charge.month === selectedMonth);
  const chargedRoomCount = new Set(currentMonthCharges.map((charge) => String(charge.roomId))).size;
  const potentialFullOccupancy = rooms.reduce((sum, room) => sum + Number(room.defaultRent), 0);
  const cashReceived = monthlyReport?.summary.rentReceived ?? totalRentReceived;
  const contextCollectionRate = totalRentCharged > 0 ? Math.round((cashReceived / totalRentCharged) * 100) : 0;
  const refunds = monthlyReport?.summary.rentRefunded ?? 0;
  const reportedExpenses = monthlyReport?.summary.totalExpenses ?? totalExpenses;
  const reportedOutstanding = monthlyReport?.summary.outstandingRent ?? totalOutstanding;
  const reportedNetCashIncome = monthlyReport?.summary.netCashIncome ?? (cashReceived - refunds - reportedExpenses);
  const reportCollectionRate = monthlyReport?.summary.collectionRate ?? contextCollectionRate;
  const overdueItems = getOverdueCharges();
  const reportOverdueItems = monthlyReport?.outstandingBalances.items ?? overdueItems;
  const rentCharged = monthlyReport?.summary.rentCharged ?? totalRentCharged;
  const chargePaidTotal = currentMonthCharges.reduce((sum, charge) => sum + Number(charge.paidAmount), 0);

  const handleExport = () => {
    window.print();
  };

  return (
    <div className="monthly-report-page">
      <div className="report-screen-content space-y-6">
      {/* Mobile back button */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="no-print md:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
      >
        <ArrowLeft size={16} />
        <span>More</span>
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            <span className="md:hidden">Monthly report</span>
            <span className="hidden md:inline">{formatMonthYear(selectedMonth)} financial report</span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="md:hidden">{settings.propertyName} · {formatMonthYear(selectedMonth)}</span>
            <span className="hidden md:inline">
              {settings.propertyName}, {settings.location} · Cash-basis results for {formatMonthYear(selectedMonth)}.
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isReportLoading || isContextLoading || !monthlyReport}
          className="no-print inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-brand-700 text-brand-700 md:bg-brand-700 md:text-white md:hover:bg-[#0D3F34] hover:bg-emerald-50 text-sm font-semibold shadow-2xs transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <Download size={18} />
          <span>
            <span className="md:hidden">Export {formatMonthShort(selectedMonth)} report</span>
          <span className="hidden md:inline">{isReportLoading || isContextLoading ? 'Preparing report…' : monthlyReport ? 'Export report' : 'Report unavailable'}</span>
          </span>
        </button>
      </div>

      {/* Month Switcher row */}
      {reportError && (
        <div className="no-print rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Could not load the full monthly report: {reportError}. The screen is showing its available ledger data.
        </div>
      )}

      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <MonthSelector currentMonth={selectedMonth} onChange={setSelectedMonth} className="w-full sm:w-64" />
        <span className="hidden md:inline text-xs text-gray-500 font-medium">
          Monthly totals · {settings.currency}
        </span>
      </div>

      {/* Mobile Hero Card: Net Cash Income */}
      <div className="md:hidden rounded-2xl p-5 bg-brand-700 text-white shadow-2xs space-y-1">
        <div className="text-xs font-medium text-emerald-200">Net cash income · {formatMonthYear(selectedMonth)}</div>
        <div className="text-3xl font-bold tracking-tight">{formatKSh(reportedNetCashIncome)}</div>
        <div className="text-xs text-emerald-100/90 pt-1">
          {formatKSh(cashReceived)} received - {formatKSh(refunds)} refunds - {formatKSh(reportedExpenses)} expenses
        </div>
      </div>

      {/* Desktop Top Metric Cards */}
      <div className="hidden md:grid grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Rent charged</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatKSh(rentCharged)}</div>
          <div className="text-xs text-gray-400 mt-2">{chargedRoomCount} rooms charged · {currentMonthCharges.length} charge records</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Rent received</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatKSh(cashReceived)}</div>
          <div className="text-xs text-emerald-600 font-medium mt-2">{reportCollectionRate}% of rent charged received</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Outstanding rent</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatKSh(reportedOutstanding)}</div>
          <div className="text-xs text-amber-text font-medium mt-2">{reportOverdueItems.length} overdue balances</div>
        </div>

        <div className="bg-brand-700 text-white rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-emerald-200 font-medium">Net cash income</div>
          <div className="text-2xl font-bold mt-1">{formatKSh(reportedNetCashIncome)}</div>
          <div className="text-xs text-emerald-100 mt-2">After refunds and {formatKSh(reportedExpenses)} expenses</div>
        </div>
      </div>

      {/* Middle Section: Cash Movement / Rent Position & Occupancy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mobile Rent Position Card */}
        <div className="md:hidden bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Rent position</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-100 text-gray-600">
              <span>Rent charged · {chargedRoomCount} rooms</span>
              <span className="font-semibold text-gray-900">{formatKSh(rentCharged)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100 text-gray-600">
              <span>Cash rent received</span>
              <span className="font-semibold text-brand-700">{formatKSh(cashReceived)}</span>
            </div>
            <div className="flex justify-between py-1 text-gray-600">
              <span>Outstanding rent</span>
              <span className="font-semibold text-gray-900">{formatKSh(reportedOutstanding)}</span>
            </div>
          </div>
          <div className="text-xs text-amber-text font-medium pt-1">
            {reportOverdueItems.length} overdue {reportOverdueItems.length === 1 ? 'balance' : 'balances'} · As of {monthlyReport?.asOfDate || 'today'}
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
                <span>Refunds and expenses</span>
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
                <span>Cash rent received</span>
                <span className="font-semibold text-gray-900">{formatKSh(cashReceived)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className="bg-brand-700 h-3 rounded-full w-full" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-gray-600 mb-1">
                <span className="md:hidden">Cash outflow</span>
                  <span className="hidden md:inline">Less refunds and expenses</span>
                <span className="font-semibold text-gray-900">
                  <span className="hidden md:inline">-</span> {formatKSh(refunds + reportedExpenses)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-gray-400 h-3 rounded-full"
                  style={{ width: `${cashReceived > 0 ? Math.min(100, ((refunds + reportedExpenses) / cashReceived) * 100) : 0}%` }}
                />
              </div>
            </div>

            <div className="hidden md:block pt-2 border-t border-gray-100">
              <div className="flex justify-between text-gray-900 font-bold mb-1">
                <span>Net cash income</span>
                <span>{formatKSh(reportedNetCashIncome)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-emerald-800 h-3 rounded-full"
                  style={{ width: `${cashReceived > 0 ? Math.max(0, Math.min(100, (reportedNetCashIncome / cashReceived) * 100)) : 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
            <span className="md:hidden">Actual cash in and out · KSh · {formatMonthYear(selectedMonth)}</span>
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
            <span className="text-xs text-gray-500">{occupancyPercentage}% occupied now</span>
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
            {rooms.filter((room) => room.status === 'vacant').length > 0
              ? <><span className="font-semibold text-gray-900">Vacant:</span> {rooms.filter((room) => room.status === 'vacant').map((room) => room.name + ' (' + formatKSh(room.defaultRent) + '/month)').join(', ')}</>
              : <span className="font-semibold text-gray-900">All rooms are currently occupied.</span>}
          </div>

          <div className="space-y-1.5 text-xs pt-2 border-t border-gray-100">
            <div className="flex justify-between text-gray-600">
              <span>Occupied rent charged</span>
              <span className="font-semibold text-gray-900">{formatKSh(rentCharged)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Potential at full occupancy</span>
              <span className="font-semibold text-gray-900">{formatKSh(potentialFullOccupancy)}</span>
            </div>
          </div>

          <div className="hidden md:block pt-2">
            <span className="inline-block px-3 py-1 bg-[#EBF5F0] text-brand-700 font-semibold text-xs rounded-full">
              {occupancyPercentage}% occupied · {occupancyCount} of {rooms.length} rooms
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
              <span>{formatKSh(reportedExpenses)}</span>
            </div>
          </div>
        </div>

        {/* Outstanding Rent Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-3">
          <h2 className="text-base font-bold text-gray-900">Outstanding rent</h2>
          <div className="text-xs text-amber-text font-medium">
            Outstanding charge balances · As of {monthlyReport?.asOfDate || 'today'}
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            {reportOverdueItems.map((item) => (
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
              <span className="text-amber-text">{formatKSh(reportedOutstanding)}</span>
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

    <section className="report-print-document" aria-label="Printable monthly financial report">
      <header className="report-print-header">
        <div className="report-print-brand">
          <div className="report-print-property">{monthlyReport?.property.name || settings.propertyName}</div>
          <div className="report-print-location">{monthlyReport?.property.location || settings.location}</div>
        </div>
        <h1>Monthly Financial Report</h1>
        <div className="report-print-period">
          <span>Reporting period</span>
          <strong>{formatMonthYear(selectedMonth)}</strong>
          <span>Prepared {monthlyReport?.asOfDate || formatDateShort(new Date().toISOString().slice(0, 10))}</span>
        </div>
      </header>

      <section className="report-print-summary">
        <h2>Financial summary</h2>
        <div className="report-print-kpis">
          <div><span>Rent charged</span><strong>{formatKSh(rentCharged)}</strong><small>{chargedRoomCount} rooms · {currentMonthCharges.length} charges</small></div>
          <div><span>Cash rent received</span><strong>{formatKSh(cashReceived)}</strong><small>By actual payment date</small></div>
          <div><span>Outstanding rent</span><strong>{formatKSh(reportedOutstanding)}</strong><small>Current period charge balance</small></div>
          <div><span>Net cash income</span><strong>{formatKSh(reportedNetCashIncome)}</strong><small>After refunds and expenses</small></div>
        </div>
      </section>

      <section className="report-print-section">
        <h2>1. Rent charge schedule</h2>
        <p className="report-print-note">
          {chargedRoomCount} distinct rooms have charges in {formatMonthYear(selectedMonth)} ({currentMonthCharges.length} charge records).
          Paid against charge is the amount applied to these rent charges; it is separate from cash received during the month.
        </p>
        <table className="report-charge-table">
          <thead><tr><th>Room</th><th>Tenant</th><th>Rent period</th><th>Due date</th><th>Charged</th><th>Paid / applied</th><th>Balance</th></tr></thead>
          <tbody>
            {currentMonthCharges.map((charge) => (
              <tr key={charge.id}>
                <td>{charge.roomName || rooms.find((room) => String(room.id) === String(charge.roomId))?.name || '—'}</td>
                <td>{charge.tenantName || '—'}</td>
                <td>{charge.month}</td>
                <td>{formatDateShort(charge.dueDate)}</td>
                <td>{formatKSh(Number(charge.amount))}</td>
                <td>{formatKSh(Number(charge.paidAmount))}</td>
                <td>{formatKSh(Number(charge.amount) - Number(charge.paidAmount))}</td>
              </tr>
            ))}
            {currentMonthCharges.length === 0 && <tr><td colSpan={7} className="report-print-empty">No rent charges were generated for this period.</td></tr>}
          </tbody>
          <tfoot><tr><th colSpan={4}>Period totals</th><th>{formatKSh(rentCharged)}</th><th>{formatKSh(chargePaidTotal)}</th><th>{formatKSh(reportedOutstanding)}</th></tr></tfoot>
        </table>
      </section>

      <section className="report-print-section report-print-cash">
        <h2>2. Cash movement</h2>
        <table className="report-cash-table">
          <tbody>
            <tr><th>Rent payments received during period</th><td>{formatKSh(cashReceived)}</td></tr>
            <tr><th>Payment refunds during period</th><td>− {formatKSh(refunds)}</td></tr>
            <tr><th>Operating expenses during period</th><td>− {formatKSh(reportedExpenses)}</td></tr>
            <tr className="report-print-total"><th>Net cash income</th><td>{formatKSh(reportedNetCashIncome)}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="report-print-section">
        <h2>3. Expense detail</h2>
        <table className="report-expense-table">
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Reference</th><th>Amount</th></tr></thead>
          <tbody>
            {(monthlyReport?.expenseBreakdown.items || []).map((expense) => (
              <tr key={expense.id}>
                <td>{formatDateShort(expense.date)}</td>
                <td>{expense.category}</td>
                <td>{expense.title}{expense.description ? ' · ' + expense.description : ''}</td>
                <td>{expense.reference || '—'}</td>
                <td>{formatKSh(expense.amount)}</td>
              </tr>
            ))}
            {(monthlyReport?.expenseBreakdown.items || []).length === 0 && <tr><td colSpan={5} className="report-print-empty">No expenses recorded for this period.</td></tr>}
          </tbody>
          <tfoot><tr><th colSpan={4}>Total expenses</th><th>{formatKSh(reportedExpenses)}</th></tr></tfoot>
        </table>
      </section>

      <section className="report-print-section">
        <h2>4. Occupancy snapshot</h2>
        <p className="report-print-note">
          Current occupancy as of {monthlyReport?.asOfDate || 'today'}: {occupancyCount} of {rooms.length} rooms ({occupancyPercentage}%).
          Potential full occupancy rent at current room defaults: {formatKSh(potentialFullOccupancy)} per month.
        </p>
        <table className="report-occupancy-table">
          <thead><tr><th>Room</th><th>Status</th><th>Default monthly rent</th></tr></thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}><td>{room.name}</td><td>{room.status === 'occupied' ? 'Occupied' : 'Vacant'}</td><td>{formatKSh(Number(room.defaultRent))}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="report-print-section">
        <h2>5. Overdue balances</h2>
        <p className="report-print-note">Only unpaid charges due on or before {monthlyReport?.asOfDate || 'today'} are listed here.</p>
        <table className="report-overdue-table">
          <thead><tr><th>Room</th><th>Tenant</th><th>Due date</th><th>Charged</th><th>Paid / applied</th><th>Overdue balance</th></tr></thead>
          <tbody>
            {reportOverdueItems.map((item) => (
              <tr key={item.id}>
                <td>{item.roomName}</td><td>{item.tenantName}</td><td>{formatDateShort(item.dueDate)}</td>
                <td>{formatKSh(item.amount)}</td><td>{formatKSh(item.paidAmount)}</td><td>{formatKSh(item.balance)}</td>
              </tr>
            ))}
            {reportOverdueItems.length === 0 && <tr><td colSpan={6} className="report-print-empty">No overdue balances as of this report date.</td></tr>}
          </tbody>
        </table>
      </section>

      <footer className="report-print-footer">
        Cash receipts are grouped by actual payment date; rent charges are grouped by rent period. Outstanding balances are not cash received.
        Security deposits are maintained separately and are excluded from rent income. Currency: {monthlyReport?.property.currency || settings.currency}.
      </footer>
    </section>
    </div>
  );
};
