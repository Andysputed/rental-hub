import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Wrench, Zap, Droplets, Sparkles } from 'lucide-react';
import { useRental } from '../context/useRental';
import { MonthSelector } from '../components/common/MonthSelector';
import { formatKSh, formatDateShort, formatMonthYear } from '../utils/format';
import type { ExpenseCategory } from '../types';

export const ExpensesPage: React.FC = () => {
  const navigate = useNavigate();
  const { expenses, selectedMonth, setSelectedMonth, totalExpenses } = useRental();

  const currentMonthExpenses = expenses.filter((e) => e.date.startsWith(selectedMonth));

  // Category aggregations
  const maintenanceTotal = currentMonthExpenses
    .filter((e) => e.category === 'maintenance')
    .reduce((sum, e) => sum + e.amount, 0);

  const utilitiesTotal = currentMonthExpenses
    .filter((e) => e.category === 'utilities')
    .reduce((sum, e) => sum + e.amount, 0);

  const cleaningTotal = currentMonthExpenses
    .filter((e) => e.category === 'cleaning')
    .reduce((sum, e) => sum + e.amount, 0);

  const getCategoryIcon = (category: ExpenseCategory, title: string) => {
    if (title.toLowerCase().includes('water')) return <Droplets size={16} className="text-blue-600" />;
    if (title.toLowerCase().includes('electric')) return <Zap size={16} className="text-amber-500" />;
    if (category === 'cleaning') return <Sparkles size={16} className="text-emerald-600" />;
    return <Wrench size={16} className="text-gray-600" />;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
      >
        <ArrowLeft size={16} />
        <span>More</span>
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Property costs, kept separate from rent</p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/expenses/add')}
          className="hidden sm:inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-700 hover:bg-[#0D3F34] text-white text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <Plus size={18} />
          <span>Add expense</span>
        </button>
      </div>

      {/* Month Switcher */}
      <MonthSelector currentMonth={selectedMonth} onChange={setSelectedMonth} />

      {/* Monthly Expenses Hero Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
        <div className="text-xs font-medium text-gray-500">{formatMonthYear(selectedMonth)} expenses</div>
        <div className="text-3xl font-bold text-gray-900 mt-1">{formatKSh(totalExpenses)}</div>
        <div className="text-xs text-gray-400 mt-2">
          {currentMonthExpenses.length} {currentMonthExpenses.length === 1 ? 'expense' : 'expenses'} · 3 categories
        </div>
      </div>

      {/* Mobile Add Expense Button */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => navigate('/expenses/add')}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs cursor-pointer"
        >
          <Plus size={18} />
          <span>Add expense</span>
        </button>
      </div>

      {/* By Category Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3">
        <h2 className="text-sm font-bold text-gray-900">By category</h2>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-gray-100">
            <span className="text-gray-500">Maintenance</span>
            <span className="font-semibold text-gray-900">{formatKSh(maintenanceTotal)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-gray-100">
            <span className="text-gray-500">Utilities</span>
            <span className="font-semibold text-gray-900">{formatKSh(utilitiesTotal)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">Cleaning</span>
            <span className="font-semibold text-gray-900">{formatKSh(cleaningTotal)}</span>
          </div>
        </div>
      </div>

      {/* Expenses List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
          <span>{formatMonthYear(selectedMonth)} expenses</span>
          <span>Newest first</span>
        </div>

        {currentMonthExpenses.length === 0 ? (
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-8 text-center text-xs text-gray-400">
            No expenses recorded for {formatMonthYear(selectedMonth)}.
          </div>
        ) : (
          currentMonthExpenses.map((exp) => (
            <div
              key={exp.id}
              className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                  {getCategoryIcon(exp.category, exp.title)}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">{exp.title}</div>
                  <div className="text-xs text-gray-500">{formatDateShort(exp.date)}</div>
                  <div className="mt-1">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 capitalize">
                      {exp.category}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">
                  {Math.round(exp.amount).toLocaleString('en-KE')}
                </div>
                <div className="text-xs text-gray-400 capitalize mt-1">
                  {exp.method === 'mpesa' ? 'M-Pesa' : exp.method === 'cash' ? 'Cash' : 'Bank'} · KSh
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-[11px] text-gray-400 text-center pb-2">
        Net cash income is rent received less these expenses. View the monthly report for the full picture.
      </div>
    </div>
  );
};
