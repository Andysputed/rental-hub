import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Home } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { Badge } from '../components/common/Badge';
import { formatKSh, formatDateShort, numberToWordsKSh } from '../utils/format';

export const ReceiptPage: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { payments, rooms, tenants, rentCharges, settings } = useRental();

  // Find payment by id or receipt number, default to first or specific
  const payment = payments.find((p) => String(p.id) === String(paymentId) || p.receiptNumber === paymentId) || payments[0];

  if (!payment) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Payment receipt not found</h2>
        <button
          onClick={() => navigate('/payments')}
          className="px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-semibold"
        >
          Back to Payments
        </button>
      </div>
    );
  }

  const room = rooms.find((r) => String(r.id) === String(payment.roomId));
  const tenant = tenants.find((t) => String(t.id) === String(payment.tenantId));
  const charge =
    rentCharges.find((c) => String(c.id) === String(payment.chargeId)) ||
    rentCharges.find((c) => String(c.tenancyId) === String(payment.tenancyId));

  const chargeAmount = charge ? charge.amount : 10000;
  const remainingBalance = Math.max(0, chargeAmount - (charge ? charge.paidAmount : payment.amount));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/payments')}
        className="no-print inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
      >
        <ArrowLeft size={16} />
        <span>Payments</span>
      </button>

      {/* Header */}
      <div className="no-print">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Payment receipt</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Saved to {tenant?.fullName || 'tenant'}'s payment history
        </p>
      </div>

      {/* Action Buttons: Print & Download */}
      <div className="no-print grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:bg-gray-50 text-gray-800 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
        >
          <Printer size={16} className="text-gray-600" />
          <span>Print</span>
        </button>

        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
        >
          <Download size={16} />
          <span>Download</span>
        </button>
      </div>

      {/* Printable Receipt Card */}
      <div className="print-area bg-white border border-[#E5E7EB] rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
        {/* Brand & Property */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-700 flex items-center justify-center text-white">
              <Home size={18} strokeWidth={2.2} />
            </div>
            <span className="text-base font-bold text-gray-900">RentalHub</span>
          </div>
        </div>

        <div>
          <div className="text-base font-bold text-gray-900">{settings.propertyName}</div>
          <div className="text-xs text-gray-500">Nairobi, Kenya</div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-1">
            RENT PAYMENT RECEIPT
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Receipt Number & Date */}
        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="text-gray-400">Receipt number</span>
            <div className="font-bold text-gray-900 mt-0.5">{payment.receiptNumber}</div>
          </div>
          <Badge variant="paid">Received</Badge>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Payment date</span>
          <span className="font-bold text-gray-900">{formatDateShort(payment.date)}</span>
        </div>

        {/* Highlight Box: Amount Received */}
        <div className="bg-[#EBF5F0]/70 border border-[#CDE5DA] rounded-xl p-4 text-center space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
            AMOUNT RECEIVED
          </div>
          <div className="text-3xl font-extrabold text-brand-700 tracking-tight">
            {formatKSh(payment.amount)}
          </div>
          <div className="text-xs text-gray-600 font-medium capitalize pt-1">
            {numberToWordsKSh(payment.amount)}
          </div>
        </div>

        {/* Details Table */}
        <div className="space-y-2 text-xs divide-y divide-gray-100">
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Received from</span>
            <span className="font-semibold text-gray-900">{tenant?.fullName}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Room</span>
            <span className="font-semibold text-gray-900">{room?.name}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Payment method</span>
            <span className="font-semibold text-gray-900 capitalize">
              {payment.method === 'mpesa' ? 'M-Pesa' : payment.method === 'cash' ? 'Cash' : 'Bank transfer'}
            </span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Transaction reference</span>
            <span className="font-mono font-semibold text-gray-900">{payment.reference}</span>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Allocation */}
        <div className="space-y-2 text-xs">
          <div className="font-semibold text-gray-900">Allocation · October 2026 rent</div>
          <div className="flex justify-between text-gray-600">
            <span>Monthly rent charge</span>
            <span className="font-semibold text-gray-900">{formatKSh(chargeAmount)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Payment allocated</span>
            <span className="font-semibold text-gray-900">{formatKSh(payment.amount)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Remaining balance</span>
            <span className={`font-semibold ${remainingBalance > 0 ? 'text-amber-text' : 'text-gray-900'}`}>
              {formatKSh(remainingBalance)}
            </span>
          </div>
          {remainingBalance > 0 && (
            <div className="text-[11px] text-gray-400">Balance due 5 October 2026</div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* Footer acknowledgment */}
        <div className="text-center space-y-1 text-xs text-gray-500">
          <div className="font-medium text-gray-700">Thank you for your payment.</div>
          <div className="text-[11px]">Issued by the landlord - {settings.propertyName}</div>
        </div>
      </div>

      <div className="no-print text-[11px] text-gray-400 text-center pb-4">
        This receipt acknowledges one recorded payment. It does not create another rent collection.
      </div>
    </div>
  );
};
