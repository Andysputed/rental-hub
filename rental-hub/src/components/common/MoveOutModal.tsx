import React, { useState, useEffect } from 'react';
import {
  LogOut,
  X,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { useRental } from '../../context/useRental';
import { tenanciesApi, getApiErrorDetail } from '../../services/api';
import { formatKSh, formatDateShort } from '../../utils/format';
import type { SettlementSummary, Deposit, PaymentMethod, MoveOutRequest } from '../../types';

interface MoveOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (tenancyId: string, data: MoveOutRequest) => Promise<void>;
  onSettled?: (deposit: Deposit) => void;
  tenancy: {
    id: string;
    roomId: string;
    tenantName: string;
    roomName: string;
    startDate: string;
    deposit?: number;
  };
}

interface RepairItem {
  id: string;
  description: string;
  amount: number;
  category: 'repair' | 'cleaning' | 'other';
}

export const MoveOutModal: React.FC<MoveOutModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onSettled,
  tenancy,
}) => {
  const { settleDeposit, moveOutTenant } = useRental();
  const today = new Date().toISOString().split('T')[0];

  const [step, setStep] = useState<'form' | 'review'>('form');
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(true);

  // Form State
  const [endDate, setEndDate] = useState<string>(today);
  const [notes, setNotes] = useState<string>('');
  const [rentDeduction, setRentDeduction] = useState<number>(0);
  const [repairDeductions, setRepairDeductions] = useState<RepairItem[]>([]);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('mpesa');
  const [refundReference, setRefundReference] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch real-time settlement summary from backend when modal opens
  useEffect(() => {
    if (!isOpen || !tenancy.id) return;

    let isMounted = true;
    queueMicrotask(() => {
      if (!isMounted) return;
      setIsLoadingSummary(true);
      setError(null);
      setStep('form');
    });

    tenanciesApi
      .getSettlementSummary(tenancy.id)
      .then((data) => {
        if (!isMounted) return;
        setSummary(data);

        const depAmount = data.deposit?.amount || tenancy.deposit || 0;
        const arrears = data.eligibleArrears?.total || 0;

        // Default rent deduction to min(deposit, arrears)
        const defaultRentDed = Math.min(depAmount, arrears);
        setRentDeduction(defaultRentDed);

        // Default refund to remaining
        const remaining = Math.max(0, depAmount - defaultRentDed);
        setRefundAmount(remaining);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Could not fetch settlement summary, using fallback:', err);
        // Fallback to local tenancy deposit
        const dep = tenancy.deposit || 0;
        setRentDeduction(0);
        setRefundAmount(dep);
      })
      .finally(() => {
        if (isMounted) setIsLoadingSummary(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, tenancy.id, tenancy.deposit]);

  if (!isOpen) return null;

  const depositHeld = summary?.deposit?.amount ?? tenancy.deposit ?? 0;
  const eligibleArrears = summary?.eligibleArrears?.total ?? 0;
  const isDepositHeld = summary?.deposit?.status === 'held' || depositHeld > 0;

  // Real-time calculations
  const totalRepairs = repairDeductions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalDeductions = (Number(rentDeduction) || 0) + totalRepairs;
  const calculatedRefundable = Math.max(0, depositHeld - totalDeductions);

  // Handle adding an itemized repair deduction
  const handleAddRepair = () => {
    const newItem: RepairItem = {
      id: Math.random().toString(36).substring(2, 9),
      description: '',
      amount: 0,
      category: 'repair',
    };
    setRepairDeductions([...repairDeductions, newItem]);
  };

  const handleUpdateRepair = <K extends keyof RepairItem>(id: string, field: K, val: RepairItem[K]) => {
    const updated = repairDeductions.map((item) => {
      if (item.id === id) {
        return { ...item, [field]: val };
      }
      return item;
    });
    setRepairDeductions(updated);

    // Auto-update refund amount if it was matching refundable
    const newRepairs = updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const newMaxRefund = Math.max(0, depositHeld - (Number(rentDeduction) || 0) - newRepairs);
    setRefundAmount(newMaxRefund);
  };

  const handleRemoveRepair = (id: string) => {
    const updated = repairDeductions.filter((item) => item.id !== id);
    setRepairDeductions(updated);
    const newRepairs = updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const newMaxRefund = Math.max(0, depositHeld - (Number(rentDeduction) || 0) - newRepairs);
    setRefundAmount(newMaxRefund);
  };

  const handleRentDeductionChange = (val: number) => {
    const clamped = Math.max(0, val);
    setRentDeduction(clamped);
    const newMaxRefund = Math.max(0, depositHeld - clamped - totalRepairs);
    setRefundAmount(newMaxRefund);
  };

  // Validation before review step
  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!endDate) {
      setError('Please select a move-out date.');
      return;
    }

    if (endDate < tenancy.startDate) {
      setError(`Move-out date cannot be before move-in date (${formatDateShort(tenancy.startDate)}).`);
      return;
    }

    if (rentDeduction > eligibleArrears) {
      setError(`Rent deduction (${formatKSh(rentDeduction)}) cannot exceed eligible arrears (${formatKSh(eligibleArrears)}).`);
      return;
    }

    for (const r of repairDeductions) {
      if (!r.description.trim()) {
        setError('Please enter a description for all repair deductions.');
        return;
      }
      if (r.amount <= 0) {
        setError('Repair deduction amounts must be greater than zero.');
        return;
      }
    }

    if (totalDeductions > depositHeld) {
      setError(`Total deductions (${formatKSh(totalDeductions)}) exceed deposit held (${formatKSh(depositHeld)}).`);
      return;
    }

    if (refundAmount > calculatedRefundable) {
      setError(`Refund amount (${formatKSh(refundAmount)}) cannot exceed the refundable balance (${formatKSh(calculatedRefundable)}).`);
      return;
    }

    setStep('review');
  };

  // Final confirmation submission to backend API
  const handleFinalSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      if (isDepositHeld && summary?.deposit?.id) {
        // Execute atomic deposit settlement + move-out
        const settled = await settleDeposit(tenancy.id, {
          endDate,
          rentDeduction: Number(rentDeduction) || 0,
          repairDeductions: repairDeductions.map((r) => ({
            description: r.description.trim(),
            amount: Number(r.amount),
            category: r.category,
          })),
          refundAmount: Number(refundAmount) || 0,
          refundMethod: refundAmount > 0 ? refundMethod : undefined,
          refundReference: refundAmount > 0 ? refundReference.trim() : undefined,
          refundDate: today,
          notes: notes.trim() || undefined,
        });

        setSuccessMessage('Tenancy move-out and deposit settlement successfully completed.');
        onSettled?.(settled);
      } else {
        // Fallback for tenancies without recorded deposits
        if (onConfirm) {
          await onConfirm(tenancy.id, {
            endDate,
            notes: notes.trim() || undefined,
          });
        } else {
          await moveOutTenant(tenancy.id, {
            endDate,
            notes: notes.trim() || undefined,
          });
        }
        setSuccessMessage('Tenant moved out successfully.');
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      console.error('Move out & settlement error:', err);
      setError(getApiErrorDetail(err, ['deposit', 'totalDeductions', 'rentDeduction'], 'Failed to complete move-out settlement.'));
      setStep('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl max-w-lg w-full border border-gray-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <LogOut size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {step === 'review' ? 'Confirm Settlement' : 'Move Out & Settle Deposit'}
              </h2>
              <p className="text-xs text-gray-500">
                {tenancy.tenantName} · {tenancy.roomName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body with internal scrolling */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Success Banner */}
          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          {isLoadingSummary ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-500 text-xs">
              <Loader2 size={24} className="animate-spin text-brand-700" />
              <span>Loading deposit & arrears details...</span>
            </div>
          ) : step === 'form' ? (
            /* STEP 1: FORM */
            <form onSubmit={handleProceedToReview} className="space-y-4">
              {/* Target Tenant & Deposit Overview Card */}
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Security Deposit Held:</span>
                  <span className="font-bold text-gray-900">{formatKSh(depositHeld)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Eligible Rent Arrears:</span>
                  <span className={`font-bold ${eligibleArrears > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                    {formatKSh(eligibleArrears)}
                  </span>
                </div>
                {eligibleArrears > 0 && summary?.eligibleArrears?.charges && (
                  <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200/60">
                    Unpaid charges: {summary.eligibleArrears.charges.map((c) => `${c.month} (${formatKSh(c.balance)})`).join(', ')}
                  </div>
                )}
              </div>

              {/* Move-out Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Move-out Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                />
              </div>

              {/* Deductions Section */}
              {isDepositHeld && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      Deductions from Deposit
                    </span>
                    <span className="text-[11px] text-gray-400">Max: {formatKSh(depositHeld)}</span>
                  </div>

                  {/* Rent Arrears Deduction */}
                  <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="rent-deduction-input" className="font-semibold text-amber-900">Apply to unpaid rent arrears</label>
                      <span className="text-amber-700 text-[11px]">Max: {formatKSh(eligibleArrears)}</span>
                    </div>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-gray-400">KSh</span>
                      <input
                        id="rent-deduction-input"
                        type="number"
                        min="0"
                        max={eligibleArrears}
                        step="100"
                        value={rentDeduction || ''}
                        onChange={(e) => handleRentDeductionChange(Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full pl-10 pr-3 py-2 rounded-lg border border-amber-300 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                      />
                    </div>
                    {rentDeduction > 0 && (
                      <p className="text-[11px] text-amber-800">
                        Will be automatically allocated to clear unpaid charges in chronological order.
                      </p>
                    )}
                  </div>

                  {/* Itemized Damage & Cleaning Deductions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-700">Repairs, damages & cleaning</span>
                      <button
                        type="button"
                        onClick={handleAddRepair}
                        className="inline-flex items-center gap-1 text-brand-700 hover:underline font-semibold cursor-pointer text-xs"
                      >
                        <Plus size={13} />
                        <span>Add item</span>
                      </button>
                    </div>

                    {repairDeductions.length === 0 ? (
                      <p className="text-[11px] text-gray-400 italic">No repair or cleaning deductions added.</p>
                    ) : (
                      repairDeductions.map((item) => (
                        <div key={item.id} className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              required
                              placeholder="e.g. Broken window repair, repainting"
                              value={item.description}
                              onChange={(e) => handleUpdateRepair(item.id, 'description', e.target.value)}
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveRepair(item.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <select
                              value={item.category}
                              onChange={(e) => handleUpdateRepair(item.id, 'category', e.target.value as RepairItem['category'])}
                              className="px-2 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 focus:outline-none"
                            >
                              <option value="repair">Damage / Repair</option>
                              <option value="cleaning">Cleaning</option>
                              <option value="other">Other</option>
                            </select>
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-xs text-gray-400">KSh</span>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                required
                                placeholder="Amount"
                                value={item.amount || ''}
                                onChange={(e) => handleUpdateRepair(item.id, 'amount', Number(e.target.value) || 0)}
                                className="w-full pl-9 pr-2 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Calculated Balance Box */}
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1.5">
                    <div className="flex justify-between text-gray-600">
                      <span>Total deductions:</span>
                      <span className="font-semibold text-gray-900">{formatKSh(totalDeductions)}</span>
                    </div>
                    <div className="flex justify-between text-brand-900 font-bold pt-1 border-t border-emerald-200">
                      <span>Refundable balance to tenant:</span>
                      <span className="text-brand-700 text-sm">{formatKSh(calculatedRefundable)}</span>
                    </div>
                  </div>

                  {/* Refund Recording */}
                  {calculatedRefundable > 0 && (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs">
                        <label htmlFor="refund-amount-input" className="font-semibold text-gray-700">Actual Refund to Disburse</label>
                        <span className="text-[11px] text-gray-400">Max: {formatKSh(calculatedRefundable)}</span>
                      </div>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-gray-400">KSh</span>
                        <input
                          id="refund-amount-input"
                          type="number"
                          min="0"
                          max={calculatedRefundable}
                          step="100"
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(Number(e.target.value) || 0)}
                          className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                        />
                      </div>

                      {refundAmount > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                          <div>
                            <label htmlFor="refund-method-select" className="block text-[11px] text-gray-500 mb-1">Disbursement Method</label>
                            <select
                              id="refund-method-select"
                              value={refundMethod}
                              onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-800"
                            >
                              <option value="mpesa">M-Pesa</option>
                              <option value="cash">Cash</option>
                              <option value="bank">Bank Transfer</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="refund-reference-input" className="block text-[11px] text-gray-500 mb-1">Transaction Reference</label>
                            <input
                              id="refund-reference-input"
                              type="text"
                              placeholder="e.g. QX948K2M1L"
                              value={refundReference}
                              onChange={(e) => setRefundReference(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-800"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Move-out Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Settlement & Move-Out Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Keys returned, room inspection complete, refund sent via M-Pesa"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Review Settlement</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </form>
          ) : (
            /* STEP 2: REVIEW SUMMARY */
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={15} className="text-amber-700" />
                  <span>Important: Irreversible Settlement Action</span>
                </div>
                <p className="text-[11px] text-amber-700">
                  Submitting this will end the active tenancy, mark {tenancy.roomName} as vacant, allocate deposit funds to outstanding arrears, and record the final refund.
                </p>
              </div>

              {/* Statement Breakdown Table */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2 text-xs divide-y divide-gray-200/70">
                <div className="flex justify-between pb-1.5">
                  <span className="text-gray-500">Tenant</span>
                  <span className="font-bold text-gray-900">{tenancy.tenantName}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-gray-500">Room</span>
                  <span className="font-bold text-gray-900">{tenancy.roomName}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-gray-500">Effective Move-Out Date</span>
                  <span className="font-semibold text-gray-900">{formatDateShort(endDate)}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-gray-500">Original Deposit Held</span>
                  <span className="font-bold text-gray-900">{formatKSh(depositHeld)}</span>
                </div>
                {rentDeduction > 0 && (
                  <div className="flex justify-between py-1.5 text-amber-800">
                    <span>Rent arrears deduction</span>
                    <span className="font-semibold">- {formatKSh(rentDeduction)}</span>
                  </div>
                )}
                {totalRepairs > 0 && (
                  <div className="flex justify-between py-1.5 text-amber-800">
                    <span>Repairs & cleaning ({repairDeductions.length} items)</span>
                    <span className="font-semibold">- {formatKSh(totalRepairs)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 text-sm font-bold text-brand-900">
                  <span>Refund Disbursed</span>
                  <span className="text-brand-700">{formatKSh(refundAmount)}</span>
                </div>
                {refundAmount > 0 && (
                  <div className="flex justify-between pt-1.5 text-[11px] text-gray-500">
                    <span>Refund Method</span>
                    <span className="font-medium text-gray-800 capitalize">
                      {refundMethod} {refundReference ? `(${refundReference})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  disabled={isSubmitting}
                  className="py-2.5 px-4 rounded-xl border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Settling and Moving Out...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      <span>Confirm & Commit Settlement</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
