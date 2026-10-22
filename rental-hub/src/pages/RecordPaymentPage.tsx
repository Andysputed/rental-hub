import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Smartphone, Banknote, Building2, Info } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { formatKSh } from '../utils/format';
import type { PaymentMethod } from '../types';

export const RecordPaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { rooms, tenants, tenancies, rentCharges, recordPayment } = useRental();

  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [amount, setAmount] = useState<number>(7500);
  const [method, setMethod] = useState<PaymentMethod>('mpesa');
  const [reference, setReference] = useState<string>('UJ4R8K2M6P');
  const [paymentDate, setPaymentDate] = useState<string>('2026-10-04');
  const [error, setError] = useState<string | null>(null);

  // Synchronize room selection when rooms or query params are available
  useEffect(() => {
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
      const charge = t ? rentCharges.find((c) => String(c.tenancyId) === String(t.id) && c.month === '2026-10') : undefined;
      if (charge) {
        const remaining = charge.amount - charge.paidAmount;
        setAmount(remaining > 0 ? remaining : charge.amount);
      }
    }
  }, [rooms, searchParams, tenancies, rentCharges]);

  const selectedTenancy = tenancies.find((t) => String(t.roomId) === String(selectedRoomId) && t.status === 'active');
  const selectedTenant = selectedTenancy ? tenants.find((t) => String(t.id) === String(selectedTenancy.tenantId)) : undefined;
  const currentCharge = selectedTenancy
    ? rentCharges.find((c) => String(c.tenancyId) === String(selectedTenancy.id) && c.month === '2026-10')
    : undefined;

  const totalChargeAmount = currentCharge ? currentCharge.amount : (selectedTenancy?.monthlyRent || 10000);
  const balanceBefore = currentCharge ? totalChargeAmount - currentCharge.paidAmount : totalChargeAmount;
  const remainingBalance = Math.max(0, balanceBefore - (Number(amount) || 0));

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

    try {
      const newPayment = await recordPayment({
        tenantId: selectedTenant.id,
        tenancyId: selectedTenancy.id,
        roomId: selectedRoomId,
        chargeId: currentCharge?.id,
        amount: Number(amount),
        date: paymentDate,
        method,
        reference: reference.trim(),
      });

      navigate(`/payments/receipt/${newPayment.id}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to record payment');
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
              const charge = t ? rentCharges.find((c) => String(c.tenancyId) === String(t.id) && c.month === '2026-10') : undefined;
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

        {/* Live Calculation Box: Apply to October rent */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-2.5">
          <div className="text-sm font-bold text-gray-900">Apply to October rent</div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Charge · due 5 Oct 2026</span>
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
              `Partial payment · ${formatKSh(remainingBalance)} remains on the October charge.`
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
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs transition-colors cursor-pointer"
          >
            <Check size={18} />
            <span>Save payment & view receipt</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/payments')}
            className="w-full py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <p className="text-[11px] text-gray-400 text-center">
            Receipt RH-2026-003 for this example
          </p>
        </div>
      </form>
    </div>
  );
};
