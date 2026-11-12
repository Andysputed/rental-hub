import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Smartphone, Banknote, Building2, Info } from 'lucide-react';
import { useRental } from '../context/useRental';
import { formatKSh, formatMonthYear, formatMonthShort } from '../utils/format';
import type { PaymentMethod } from '../types';
import { getErrorMessage } from '../services/api';

export const RecordPaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { rooms, tenants, tenancies, rentCharges, recordPayment, selectedMonth } = useRental();

  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('mpesa');
  const [reference, setReference] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [allocationMode, setAllocationMode] = useState<'automatic' | 'manual'>('automatic');
  const [manualAllocations, setManualAllocations] = useState<Array<{ chargeId: string; amount: string }>>([]);
  const [reservations, setReservations] = useState<Array<{ month: string; amount: string }>>([]);

  // Synchronize room selection when rooms or query params are available
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
    if (rooms.length === 0) return;

    const queryRoomId = searchParams.get('roomId');
    let matchedRoom = null;

    if (queryRoomId) {
      const normalizedQuery = queryRoomId.replace(/^r/i, '').trim();
      matchedRoom = rooms.find(
        (r) =>
          String(r.id) === String(queryRoomId) ||
          r.number === queryRoomId ||
          r.number === normalizedQuery ||
          String(r.id) === normalizedQuery
      );
    }

    if (!matchedRoom && selectedRoomId) {
      matchedRoom = rooms.find((r) => String(r.id) === String(selectedRoomId));
    }

    if (!matchedRoom) {
      // Pick first occupied room with an active tenancy, otherwise first occupied room
      matchedRoom = rooms.find((r) => r.status === 'occupied') || rooms[0];
    }

    if (matchedRoom) {
      const rid = String(matchedRoom.id);
      setSelectedRoomId(rid);
      const t = tenancies.find((ten) => String(ten.roomId) === rid && ten.status === 'active');
      const charge = t ? rentCharges.find((c) => String(c.tenancyId) === String(t.id) && c.month === selectedMonth) : undefined;
      if (charge) {
        const remaining = charge.amount - charge.paidAmount;
        setAmount(remaining > 0 ? remaining : charge.amount);
      } else if (t) {
        setAmount(t.monthlyRent || 10000);
      }
    }
    });
    return () => { active = false; };
  }, [rooms, searchParams, tenancies, rentCharges, selectedMonth, selectedRoomId]);

  const selectedTenancy = tenancies.find((t) => String(t.roomId) === String(selectedRoomId) && t.status === 'active');
  const selectedTenant = selectedTenancy ? tenants.find((t) => String(t.id) === String(selectedTenancy.tenantId)) : undefined;
  const currentCharge = selectedTenancy
    ? rentCharges.find((c) => String(c.tenancyId) === String(selectedTenancy.id) && c.month === selectedMonth)
    : undefined;

  const totalChargeAmount = currentCharge ? currentCharge.amount : (selectedTenancy?.monthlyRent || 10000);
  const balanceBefore = currentCharge ? totalChargeAmount - currentCharge.paidAmount : totalChargeAmount;
  const remainingBalance = Math.max(0, balanceBefore - (Number(amount) || 0));
  const eligibleCharges = selectedTenancy
    ? rentCharges.filter((charge) =>
      String(charge.tenancyId) === String(selectedTenancy.id) &&
      charge.month >= selectedTenancy.startDate.slice(0, 7) &&
      Number(charge.amount) > Number(charge.paidAmount)
    ).sort((a, b) => a.month.localeCompare(b.month))
    : [];
  const manuallyDirected = manualAllocations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) +
    reservations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const outstandingEligible = eligibleCharges.reduce((sum, charge) => sum + Number(charge.amount) - Number(charge.paidAmount), 0);
  const previewCredit = Math.max(0, (Number(amount) || 0) - (allocationMode === 'manual' ? manuallyDirected : Math.min(Number(amount) || 0, outstandingEligible)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant || !selectedTenancy) {
      setError('Please select an occupied room with an active tenancy');
      return;
    }
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (!reference.trim()) {
      setError('Please enter a payment reference code');
      return;
    }
    if (allocationMode === 'manual' && manuallyDirected > Number(amount)) {
      setError('Selected allocations and reservations exceed the payment amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newPayment = await recordPayment({
        tenantId: selectedTenant.id,
        tenancyId: selectedTenancy.id,
        roomId: selectedRoomId,
        amount: Number(amount),
        date: paymentDate,
        method,
        reference: reference.trim(),
        allocationMode,
        allocations: allocationMode === 'manual'
          ? manualAllocations.filter((item) => Number(item.amount) > 0)
          : undefined,
        reservations: allocationMode === 'manual'
          ? reservations.filter((item) => Number(item.amount) > 0)
          : undefined,
      });

      navigate(`/payments/receipt/${newPayment.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to record payment'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/payments')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
      >
        <ArrowLeft size={16} />
        <span>Payments</span>
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Record payment</h1>
        <p className="text-sm text-gray-500 mt-0.5">Capture rent and allocate it to a charge</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Tenant & Room Selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Tenant & room <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedRoomId}
            onChange={(e) => {
              setSelectedRoomId(e.target.value);
              const t = tenancies.find((ten) => String(ten.roomId) === String(e.target.value) && ten.status === 'active');
              const charge = t ? rentCharges.find((c) => String(c.tenancyId) === String(t.id) && c.month === selectedMonth) : undefined;
              if (charge) {
                const remaining = charge.amount - charge.paidAmount;
                setAmount(remaining > 0 ? remaining : charge.amount);
              } else if (t) {
                setAmount(t.monthlyRent || 10000);
              }
            }}
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
          >
            {rooms.length === 0 ? (
              <option value="">Loading occupied rooms...</option>
            ) : (
              rooms
                .filter((r) => r.status === 'occupied')
                .map((r) => {
                  const t = tenancies.find((ten) => String(ten.roomId) === String(r.id) && ten.status === 'active');
                  const tenName = t ? tenants.find((tenant) => String(tenant.id) === String(t.tenantId))?.fullName : '';
                  return (
                    <option key={r.id} value={String(r.id)}>
                      {tenName ? `${tenName} · ${r.name}` : r.name}
                    </option>
                  );
                })
            )}
          </select>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Amount received (KSh) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            required
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Enter the amount actually received, not the full rent.
          </p>
        </div>

        {/* Payment Method Selector (3 Cards) */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Payment method <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => {
                setMethod('mpesa');
                if (reference.startsWith('CASH-') || reference.startsWith('BNK-')) {
                  setReference('UJ4R8K2M6P');
                }
              }}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                method === 'mpesa'
                  ? 'bg-[#EBF5F0] border-brand-700 text-brand-700'
                  : 'bg-white border-[#E5E7EB] text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Smartphone size={20} className="mb-1.5" />
              <div className="flex items-center gap-1">
                <span>M-Pesa</span>
                {method === 'mpesa' && <Check size={14} />}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setMethod('cash');
                if (reference.startsWith('UJ') || reference.startsWith('BNK-')) {
                  setReference(`CASH-${Date.now().toString().slice(-6)}`);
                }
              }}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                method === 'cash'
                  ? 'bg-[#EBF5F0] border-brand-700 text-brand-700'
                  : 'bg-white border-[#E5E7EB] text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Banknote size={20} className="mb-1.5" />
              <div className="flex items-center gap-1">
                <span>Cash</span>
                {method === 'cash' && <Check size={14} />}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setMethod('bank');
                if (reference.startsWith('UJ') || reference.startsWith('CASH-')) {
                  setReference(`BNK-${Date.now().toString().slice(-6)}`);
                }
              }}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                method === 'bank'
                  ? 'bg-[#EBF5F0] border-brand-700 text-brand-700'
                  : 'bg-white border-[#E5E7EB] text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Building2 size={20} className="mb-1.5" />
              <div className="flex items-center gap-1">
                <span>Bank</span>
                {method === 'bank' && <Check size={14} />}
              </div>
            </button>
          </div>
        </div>

        {/* Transaction Reference Input */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {method === 'mpesa'
              ? 'M-Pesa transaction reference'
              : method === 'cash'
              ? 'Receipt or cash reference'
              : 'Bank transaction reference'}{' '}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            {method === 'mpesa'
              ? 'Use the transaction code from the M-Pesa confirmation.'
              : 'Keep reference code unique for audit trail.'}
          </p>
        </div>

        {/* Payment Date */}
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

        {/* Hybrid allocation controls */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-700">Allocation</div>
            <p className="text-[11px] text-gray-500 mt-1">The receipt records money received; allocation records which rent periods it covers.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['automatic', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setAllocationMode(mode);
                  const payAmount = Number(amount) || 0;
                  if (mode === 'manual' && manualAllocations.length === 0 && payAmount > 0) {
                    let rem = payAmount;
                    const prefilled: Array<{ chargeId: string; amount: string }> = [];
                    for (const ch of eligibleCharges) {
                      if (rem <= 0) break;
                      const bal = Math.max(0, Number(ch.amount) - Number(ch.paidAmount));
                      if (bal > 0) {
                        const alloc = Math.min(bal, rem);
                        prefilled.push({ chargeId: String(ch.id), amount: String(alloc) });
                        rem -= alloc;
                      }
                    }
                    if (prefilled.length > 0) {
                      setManualAllocations(prefilled);
                    }
                  }
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize ${
                  allocationMode === mode
                    ? 'border-brand-700 bg-[#EBF5F0] text-brand-700'
                    : 'border-[#E5E7EB] text-gray-600'
                }`}
              >
                {mode === 'automatic' ? 'Automatic · oldest first' : 'Manual'}
              </button>
            ))}
          </div>
          {allocationMode === 'manual' && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-gray-600">Existing outstanding charges</div>
              {eligibleCharges.length === 0 && (
                <p className="text-xs text-gray-500">No eligible rent charges yet. You can reserve credit for future months.</p>
              )}
              {eligibleCharges.map((charge) => {
                const existing = manualAllocations.find((item) => item.chargeId === String(charge.id))?.amount ?? '';
                const balance = Number(charge.amount) - Number(charge.paidAmount);
                return (
                  <label key={charge.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-gray-700">
                      {formatMonthYear(charge.month)} · balance {formatKSh(balance)}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={balance}
                      step="0.01"
                      value={existing}
                      onChange={(event) =>
                        setManualAllocations((items) => {
                          const rest = items.filter((item) => item.chargeId !== String(charge.id));
                          return event.target.value
                            ? [...rest, { chargeId: String(charge.id), amount: event.target.value }]
                            : rest;
                        })
                      }
                      placeholder="0.00"
                      className="w-32 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-right"
                    />
                  </label>
                );
              })}
              <div className="text-[11px] font-semibold text-gray-600 pt-1">Reserve for future rent periods</div>
              {reservations.map((item, index) => (
                <div key={`${item.month}-${index}`} className="flex gap-2">
                  <input
                    type="month"
                    min={selectedTenancy?.startDate.slice(0, 7)}
                    value={item.month}
                    onChange={(event) =>
                      setReservations((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, month: event.target.value } : row))
                      )
                    }
                    className="min-w-0 flex-1 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount}
                    onChange={(event) =>
                      setReservations((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, amount: event.target.value } : row))
                      )
                    }
                    placeholder="Amount"
                    className="w-32 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-right text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setReservations((rows) => rows.filter((_, i) => i !== index))}
                    className="px-2 text-red-600"
                    aria-label="Remove reservation"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setReservations((rows) => [...rows, { month: '', amount: '' }])}
                className="text-xs font-semibold text-brand-700 hover:underline">+ Add future rent month</button>
              <div className="flex justify-between border-t border-gray-100 pt-2 text-xs">
                <span>Directed to rent / future reservations</span><strong>{formatKSh(manuallyDirected)}</strong>
              </div>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-100 pt-2 text-xs">
            <span>Unallocated advance credit after this receipt</span><strong>{formatKSh(previewCredit)}</strong>
          </div>
        </div>

        {/* Live Calculation Box: Apply to selected month rent */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-2.5">
          <div className="text-sm font-bold text-gray-900">Apply to {formatMonthYear(selectedMonth)} rent</div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Charge · due {selectedTenancy?.rentDueDay || 5} {formatMonthShort(selectedMonth)}</span>
              <span className="font-semibold text-gray-900">{formatKSh(totalChargeAmount)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Balance before this payment</span>
              <span className="font-semibold text-gray-900">{formatKSh(balanceBefore)}</span>
            </div>
            <div className="flex justify-between text-brand-700 font-medium">
              <span>This payment</span>
              <span>- {formatKSh(amount || 0)}</span>
            </div>

            <div className="pt-2 border-t border-gray-100 flex justify-between font-bold text-gray-900">
              <span>Remaining balance</span>
              <span>{formatKSh(remainingBalance)}</span>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 pt-1">
            {remainingBalance === 0 ? (
              <span className="text-[#0D5B46] font-medium">Full payment · Charge will be cleared.</span>
            ) : (
              `Partial payment · ${formatKSh(remainingBalance)} remains on the ${formatMonthShort(selectedMonth)} charge.`
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-[#EBF5F0]/60 border border-[#CDE5DA] rounded-2xl p-4 flex items-start gap-3 text-xs text-gray-700">
          <Info size={18} className="text-brand-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-gray-900">Payment allocation notice</div>
            <div className="text-gray-600 mt-0.5">
              This entry records manual rent collection. Deposits and previous balance reconciliations remain distinct.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs transition-colors ${
              isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            <Check size={18} />
            <span>{isSubmitting ? 'Recording payment...' : 'Save payment & view receipt'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/payments')}
            className="w-full py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
