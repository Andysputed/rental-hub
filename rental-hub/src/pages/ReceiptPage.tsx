import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download, CheckCircle2, Home, Check, X, Copy } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { Badge } from '../components/common/Badge';
import { formatKSh, formatDateShort, numberToWordsKSh, formatMonthYear } from '../utils/format';
import { getWhatsAppNumber } from '../utils/phone';
import { generateReceiptShareMessage } from '../utils/messages';
import { downloadReceiptPdf, getReceiptPdfFile, type ReceiptPdfData } from '../utils/receiptPdf';

export const ReceiptPage: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { payments, rooms, tenants, rentCharges, settings } = useRental();

  const [shareNotice, setShareNotice] = useState<{ open: boolean; message: string; filename?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Find payment by id or receipt number, default to first or specific
  const payment = payments.find((p) => String(p.id) === String(paymentId) || p.receiptNumber === paymentId) || payments[0];

  if (!payment) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Payment receipt not found</h2>
        <button
          onClick={() => navigate('/payments')}
          className="px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          Back to Payments
        </button>
      </div>
    );
  }

  const room = rooms.find((r) => String(r.id) === String(payment.roomId));
  const tenant = tenants.find((t) => String(t.id) === String(payment.tenantId));
  const charge =
    (payment.chargeId ? rentCharges.find((c) => String(c.id) === String(payment.chargeId)) : undefined) ||
    rentCharges.find((c) => String(c.tenancyId) === String(payment.tenancyId));

  const chargeAmount = charge ? charge.amount : 10000;
  const remainingBalance = Math.max(0, chargeAmount - (charge ? charge.paidAmount : payment.amount));
  const monthName = charge?.month
    ? formatMonthYear(charge.month)
    : payment.date
    ? formatMonthYear(payment.date.slice(0, 7))
    : 'Rent';

  const receiptPdfData: ReceiptPdfData = {
    payment,
    room,
    tenant,
    settings,
    chargeAmount,
    remainingBalance,
    monthName,
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    downloadReceiptPdf(receiptPdfData);
  };

  // WhatsApp receipt sharing with PDF
  const waNumber = getWhatsAppNumber(tenant?.phone);
  const shareMsg =
    tenant && room
      ? generateReceiptShareMessage({
          tenantName: tenant.fullName,
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          paymentDate: payment.date,
          roomName: room.name,
          propertyName: settings.propertyName,
        })
      : '';

  const handleShareWhatsApp = async () => {
    const filename = `${payment.receiptNumber}.pdf`;

    try {
      const pdfFile = getReceiptPdfFile(receiptPdfData);

      // Check if native mobile sharing with files is supported (iOS Safari, Android Chrome)
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: `Rent Payment Receipt ${payment.receiptNumber}`,
          text: shareMsg,
        });
        return;
      }
    } catch (err: any) {
      // User cancelled share dialog or not supported — continue to fallback
      if (err?.name === 'AbortError') return;
    }

    // Fallback for desktop & browsers without direct file-sharing to WhatsApp:
    // 1. Download the PDF file to their machine
    downloadReceiptPdf(receiptPdfData);

    // 2. Open WhatsApp with pre-filled message
    if (waNumber) {
      const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(shareMsg)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    // 3. Show a friendly helper banner
    setShareNotice({
      open: true,
      filename,
      message: waNumber
        ? `Receipt ${filename} downloaded! WhatsApp has opened in a new tab. Simply attach (📎) or drag & drop the downloaded PDF into your chat.`
        : `Receipt ${filename} downloaded! You can now send it to your tenant via WhatsApp or email.`,
    });
  };

  const handleCopyMessage = () => {
    if (!shareMsg) return;
    navigator.clipboard.writeText(shareMsg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="max-w-md mx-auto space-y-5">
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
          Saved to {tenant?.fullName || 'tenant'}'s payment history · Ready to print or share
        </p>
      </div>

      {/* Primary Action Buttons: Print & Download PDF */}
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
          onClick={handleDownloadPdf}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
        >
          <Download size={16} />
          <span>Download PDF</span>
        </button>
      </div>

      {/* WhatsApp Share Button */}
      <div className="no-print">
        <button
          type="button"
          onClick={handleShareWhatsApp}
          className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-emerald-300 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          title="Share receipt as PDF via WhatsApp"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span>Share receipt as PDF via WhatsApp</span>
        </button>
      </div>

      {/* Share Notification / Instructions Modal */}
      {shareNotice?.open && (
        <div className="no-print p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-xs text-emerald-900">
              <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
              <span>PDF Ready to Send</span>
            </div>
            <button
              type="button"
              onClick={() => setShareNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 p-0.5 rounded cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          <p className="text-xs text-emerald-900 leading-relaxed">{shareNotice.message}</p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-100/50 text-[11px] font-semibold text-emerald-900 transition-colors cursor-pointer"
            >
              {copied ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} />}
              <span>{copied ? 'Message copied!' : 'Copy receipt text'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShareNotice(null)}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-semibold hover:bg-emerald-800 transition-colors cursor-pointer ml-auto"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Printable & Screen Receipt Card — styled with crisp colors & high-contrast visibility */}
      <div className="print-area bg-white text-gray-900 border border-[#E5E7EB] rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
        {/* Brand & Property */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-700 flex items-center justify-center text-white">
              <Home size={18} strokeWidth={2.2} />
            </div>
            <div>
              <span className="text-base font-bold text-gray-900">{settings.propertyName || 'Acacia House'}</span>
              <div className="text-[11px] text-gray-500">Nairobi, Kenya</div>
            </div>
          </div>
          <Badge variant="paid">Received</Badge>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
            OFFICIAL RENT PAYMENT RECEIPT
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Receipt Number & Date */}
        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="text-gray-400">Receipt number</span>
            <div className="font-bold text-gray-900 mt-0.5 tracking-tight font-mono">{payment.receiptNumber}</div>
          </div>
          <div className="text-right">
            <span className="text-gray-400">Payment date</span>
            <div className="font-bold text-gray-900 mt-0.5">{formatDateShort(payment.date)}</div>
          </div>
        </div>

        {/* Highlight Box: Amount Received */}
        <div className="bg-[#EBF5F0] border border-[#CDE5DA] rounded-xl p-4 text-center space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
            AMOUNT RECEIVED (KES)
          </div>
          <div className="text-3xl font-extrabold text-brand-700 tracking-tight">
            {formatKSh(payment.amount)}
          </div>
          <div className="text-xs text-gray-700 font-medium capitalize pt-1">
            {numberToWordsKSh(payment.amount)} only
          </div>
        </div>

        {/* Details Table */}
        <div className="space-y-2 text-xs divide-y divide-gray-100">
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Received from</span>
            <span className="font-semibold text-gray-900">{tenant?.fullName || 'Tenant'}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Room</span>
            <span className="font-semibold text-gray-900">{room?.name || 'Assigned Room'}</span>
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
          <div className="font-semibold text-gray-900">Allocation · {monthName} rent</div>
          <div className="flex justify-between text-gray-600">
            <span>Monthly rent charge</span>
            <span className="font-semibold text-gray-900">{formatKSh(chargeAmount)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Payment allocated</span>
            <span className="font-semibold text-brand-700">- {formatKSh(payment.amount)}</span>
          </div>
          <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-50">
            <span className="font-medium">Remaining balance</span>
            <span className={`font-semibold ${remainingBalance > 0 ? 'text-amber-700' : 'text-brand-700'}`}>
              {remainingBalance > 0 ? formatKSh(remainingBalance) : 'KSh 0 (Paid in full)'}
            </span>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Footer acknowledgment */}
        <div className="text-center space-y-1 text-xs text-gray-500">
          <div className="font-semibold text-gray-800">Thank you for your payment.</div>
          <div className="text-[11px] text-gray-400">
            Issued by {settings.landlordName || 'the landlord'} · {settings.propertyName}
          </div>
        </div>
      </div>

      <div className="no-print text-[11px] text-gray-400 text-center pb-4">
        Official digital receipt acknowledgment · Backed by RentalHub ledger
      </div>
    </div>
  );
};
