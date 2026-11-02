import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2 } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { MonthSelector } from '../components/common/MonthSelector';
import { Badge } from '../components/common/Badge';
import { formatKSh, formatMonthYear, formatMonthShort } from '../utils/format';

export const RentChargesPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    settings,
    rooms,
    tenants,
    tenancies,
    rentCharges,
    selectedMonth,
    setSelectedMonth,
    totalRentCharged,
    totalRentReceived,
    totalOutstanding,
    generateMonthlyCharges,
  } = useRental();

  const [message, setMessage] = useState<string | null>(null);

  const currentMonthCharges = rentCharges.filter((c) => c.month === selectedMonth);
  const overdueCount = currentMonthCharges.filter((c) => c.status === 'overdue' && c.amount > c.paidAmount).length;

  const handleGenerate = async () => {
    try {
      const generated = await generateMonthlyCharges(selectedMonth);
      if (generated > 0) {
        setMessage(`Generated ${generated} monthly rent charge(s) for ${selectedMonth}.`);
      } else {
        setMessage(`All occupied room charges for ${selectedMonth} are already generated. No duplicates created.`);
      }
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage(err?.message || 'Failed to generate monthly charges');
      setTimeout(() => setMessage(null), 4000);
    }
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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Rent charges</h1>
        <p className="text-sm text-gray-500 mt-0.5">Monthly rent ledger · {settings.propertyName}</p>
      </div>

      {/* Month Switcher */}
      <MonthSelector currentMonth={selectedMonth} onChange={setSelectedMonth} />

      {/* Summary Box */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs divide-y divide-gray-100 text-xs">
        <div className="flex justify-between py-2 text-gray-600">
          <span>{formatMonthYear(selectedMonth)} rent charged</span>
          <span className="font-bold text-gray-900">{formatKSh(totalRentCharged)}</span>
        </div>
        <div className="flex justify-between py-2 text-gray-600">
          <span>Received</span>
          <span className="font-bold text-brand-700">{formatKSh(totalRentReceived)}</span>
        </div>
        <div className="flex justify-between py-2 text-gray-600">
          <span>Outstanding · {overdueCount} overdue</span>
          <span className="font-bold text-gray-900">{formatKSh(totalOutstanding)}</span>
        </div>
      </div>

      {/* Due Date Indicator */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-2 text-gray-700 font-semibold">
          <Calendar size={16} className="text-brand-700" />
          <span>Due {settings.defaultDueDay || 5} {formatMonthYear(selectedMonth)}</span>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="text-brand-700 font-semibold hover:underline cursor-pointer"
        >
          Change due date
        </button>
      </div>

      {/* Room Charges List */}
      <div className="space-y-3">
        {currentMonthCharges.map((charge) => {
          const room = rooms.find((r) => r.id === charge.roomId);
          const tenancy = tenancies.find((t) => t.id === charge.tenancyId);
          const tenant = tenancy ? tenants.find((t) => t.id === tenancy.tenantId) : undefined;
          const balance = charge.amount - charge.paidAmount;
          const isPaid = balance === 0;

          return (
            <div
              key={charge.id}
              onClick={() => navigate(`/rooms/${room?.id}`)}
              className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs cursor-pointer hover:border-gray-300 transition-all space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">
                  {room?.name} · {formatKSh(charge.amount)}
                </span>
                <Badge variant={isPaid ? 'paid' : 'overdue'}>{isPaid ? 'Paid' : 'Overdue'}</Badge>
              </div>

              <div className="text-xs text-gray-500">
                {tenant?.fullName} · Due {settings.defaultDueDay || 5} {formatMonthShort(selectedMonth)}
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100">
                <span className="text-gray-600">Paid {formatKSh(charge.paidAmount)}</span>
                <span className={`font-semibold ${isPaid ? 'text-gray-900' : 'text-amber-text'}`}>
                  Balance {formatKSh(balance)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Vacant Room Notice */}
        {rooms
          .filter((r) => r.status === 'vacant')
          .map((vr) => (
            <div
              key={vr.id}
              className="p-3 bg-[#F9FAFB] rounded-xl text-xs text-gray-500 text-center border border-dashed border-gray-200"
            >
              {vr.name} is vacant. No {formatMonthShort(selectedMonth)} charge generated.
            </div>
          ))}
      </div>

      {/* Bottom Generate Charges Card */}
      <div className="bg-[#EBF5F0]/60 border border-[#CDE5DA] rounded-2xl p-5 shadow-2xs space-y-3">
        {message ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-700">
            <CheckCircle2 size={16} />
            <span>{message}</span>
          </div>
        ) : (
          <div>
            <div className="text-sm font-bold text-gray-900">{formatMonthYear(selectedMonth)} charges are up to date</div>
            <div className="text-xs text-gray-600 mt-0.5">
              {currentMonthCharges.length} {currentMonthCharges.length === 1 ? 'charge' : 'charges'} generated for {formatMonthYear(selectedMonth)}. Existing charges will not be duplicated.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white border border-[#CDE5DA] hover:bg-emerald-50 text-brand-700 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
        >
          <Calendar size={16} />
          <span>Generate monthly charges</span>
        </button>
      </div>
    </div>
  );
};
