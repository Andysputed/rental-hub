import React, { useState } from 'react';
import { LogOut, X, AlertTriangle, Loader2 } from 'lucide-react';
import { formatDateShort } from '../../utils/format';

interface MoveOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tenancyId: string, data: { endDate: string; notes?: string }) => Promise<void>;
  tenancy: {
    id: string;
    roomId: string;
    tenantName: string;
    roomName: string;
    startDate: string;
  };
}

export const MoveOutModal: React.FC<MoveOutModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tenancy,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [endDate, setEndDate] = useState<string>(today);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
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

    setIsSubmitting(true);
    try {
      await onConfirm(tenancy.id, {
        endDate,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to complete move-out. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl max-w-md w-full border border-gray-100 shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <LogOut size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Move out tenant</h2>
              <p className="text-xs text-gray-500">End tenancy at Acacia House</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Target Tenant & Room Banner */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Tenant</span>
              <span className="font-bold text-gray-900">{tenancy.tenantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Room</span>
              <span className="font-bold text-gray-900">{tenancy.roomName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Move-in date</span>
              <span className="font-medium text-gray-700">{formatDateShort(tenancy.startDate)}</span>
            </div>
          </div>

          {/* Warning Message */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Notice:</span> This ends the active tenancy and makes{' '}
              <span className="font-semibold">{tenancy.roomName}</span> available for a new tenant. All
              past charges, payment receipts, and deposit records remain safely preserved in the ledger.
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          {/* Move-out Date Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Move-out date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 disabled:bg-gray-100"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Defaults to today. Must be on or after the move-in date.
            </p>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Move-out notes / reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Relocated for work, inspection complete, key returned"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 disabled:bg-gray-100"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Moving out...</span>
                </>
              ) : (
                <>
                  <LogOut size={14} />
                  <span>Confirm Move Out</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
