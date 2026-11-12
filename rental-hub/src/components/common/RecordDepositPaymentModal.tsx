import React, { useState } from 'react';
import { X, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useRental } from '../../context/useRental';
import { getErrorMessage } from '../../services/api';
import { formatKSh } from '../../utils/format';
import type { Deposit, PaymentMethod } from '../../types';

interface RecordDepositPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  deposit: Deposit;
  tenantName: string;
  roomName: string;
  onSuccess?: () => void;
}

export const RecordDepositPaymentModal: React.FC<RecordDepositPaymentModalProps> = ({
  isOpen,
  onClose,
  deposit,
  tenantName,
  roomName,
  onSuccess,
}) => {
  const { recordDepositPayment } = useRental();
  const today = new Date().toISOString().split('T')[0];

  const outstanding = deposit.outstandingBalance ?? Math.max(0, (deposit.requiredAmount || 0) - (deposit.totalPaid ?? deposit.amount ?? 0));

  const [amount, setAmount] = useState<number>(outstanding || 0);
  const [paymentDate, setPaymentDate] = useState<string>(today);
  const [method, setMethod] = useState<PaymentMethod>('mpesa');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (payAmount > outstanding) {
      setError(`Payment cannot exceed the outstanding balance of ${formatKSh(outstanding)}.`);
      return;
    }

    if (method === 'mpesa' && !reference.trim()) {
      setError('M-Pesa transaction reference is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      await recordDepositPayment(deposit.id, {
        amount: payAmount,
        paymentDate,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to record deposit payment. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Record Deposit Payment</h2>
              <div className="text-[11px] text-gray-500">
                {tenantName} · {roomName}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {success ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-base font-bold text-gray-900">Payment Recorded!</h3>
              <p className="text-xs text-gray-500">
                Security deposit balance has been updated successfully.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                  {error}
                </div>
              )}

              {/* Outstanding Balance Banner */}
              <div className="p-3.5 bg-gray-50 border border-gray-200/80 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Required Deposit:</span>
                  <span className="font-semibold text-gray-900">{formatKSh(deposit.requiredAmount || 0)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total Paid So Far:</span>
                  <span className="font-semibold text-brand-700">{formatKSh(deposit.totalPaid ?? deposit.amount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-gray-900 pt-1.5 border-t border-gray-200 font-bold">
                  <span>Outstanding Balance:</span>
                  <span className="text-amber-700">{formatKSh(outstanding)}</span>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Payment amount (KSh) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={outstanding}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 font-semibold"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Payment date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                />
              </div>

              {/* Method & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Payment method <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 capitalize"
                  >
                    <option value="mpesa">M-Pesa</option>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Reference {method === 'mpesa' ? <span className="text-red-500">*</span> : '(optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder={method === 'mpesa' ? 'e.g. QKH7123XYZ' : 'e.g. Cash / Receipt #'}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 font-mono text-xs uppercase"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Second installment paid via M-Pesa"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-xs font-semibold text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Deposit Payment</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

