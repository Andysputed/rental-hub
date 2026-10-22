import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Info } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import type { ExpenseCategory, PaymentMethod } from '../types';

export const AddExpensePage: React.FC = () => {
  const navigate = useNavigate();
  const { addExpense, settings, totalExpenses } = useRental();

  const [category, setCategory] = useState<ExpenseCategory>('maintenance');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>('2026-10-19');
  const [description, setDescription] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('mpesa');
  const [reference, setReference] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (!description.trim()) {
      setError('Please provide a description');
      return;
    }

    try {
      await addExpense({
        title: description.trim(),
        category,
        amount: Number(amount),
        date,
        method,
        reference: reference.trim() || undefined,
        description: description.trim(),
        property: settings.propertyName,
      });

      navigate('/expenses');
    } catch (err: any) {
      setError(err?.message || 'Failed to add expense');
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/expenses')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
      >
        <ArrowLeft size={16} />
        <span>Expenses</span>
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Add expense</h1>
        <p className="text-sm text-gray-500 mt-0.5">Record a cost for {settings.propertyName}</p>
      </div>

      {/* Info notice */}
      <div className="bg-[#EBF5F0]/60 border border-[#CDE5DA] rounded-2xl p-4 flex items-start gap-3 text-xs text-gray-700">
        <Info size={18} className="text-brand-700 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-gray-900">Property expense</div>
          <div className="text-gray-600 mt-0.5">
            Expenses reduce net cash income. They do not reduce a tenant's outstanding rent.
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#114B3E]/20 focus:border-brand-700"
          >
            <option value="maintenance">Maintenance</option>
            <option value="utilities">Utilities</option>
            <option value="cleaning">Cleaning</option>
          </select>
          <p className="text-[11px] text-gray-400 mt-1">Maintenance, Utilities or Cleaning</p>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Amount (KSh) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            required
            min={1}
            step="any"
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="0.00"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#114B3E]/20 focus:border-brand-700"
          />
          <p className="text-[11px] text-gray-400 mt-1">Enter the total amount paid in Kenyan Shillings.</p>
        </div>

        {/* Expense Date */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Expense date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#114B3E]/20 focus:border-brand-700"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this expense for?"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#114B3E]/20 focus:border-brand-700"
          />
          <p className="text-[11px] text-gray-400 mt-1">For example, repair to the shared water tap.</p>
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Payment method <span className="text-red-500">*</span>
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#114B3E]/20 focus:border-brand-700"
          >
            <option value="mpesa">M-Pesa</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank transfer</option>
          </select>
          <p className="text-[11px] text-gray-400 mt-1">M-Pesa, cash or bank transfer</p>
        </div>

        {/* Payment Reference */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Payment reference (optional)</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transaction code or voucher number"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#114B3E]/20 focus:border-brand-700"
          />
        </div>

        {/* Summary Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs space-y-2 text-xs">
          <div className="flex justify-between text-gray-600">
            <span>Property</span>
            <span className="font-semibold text-gray-900">{settings.propertyName}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Reporting month</span>
            <span className="font-semibold text-gray-900">October 2026</span>
          </div>
          <div className="text-[11px] text-gray-400 pt-1 border-t border-gray-100">
            This draft is not included in the KSh {Math.round(totalExpenses).toLocaleString('en-KE')} expense total until saved.
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-3 pt-2">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs transition-colors cursor-pointer"
          >
            <Check size={18} />
            <span>Save expense</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/expenses')}
            className="w-full py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <p className="text-[11px] text-gray-400 text-center">* Required fields</p>
        </div>
      </form>
    </div>
  );
};
