import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, UserPlus, Info } from 'lucide-react';
import { useRental } from '../context/useRental';
import { Badge } from '../components/common/Badge';
import { formatKSh, formatDateShort } from '../utils/format';
import { getErrorMessage } from '../services/api';
import { calculateFirstMonthRent } from '../utils/rent';

export const RegisterTenantPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { rooms, registerTenant, settings } = useRental();

  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [moveInDate, setMoveInDate] = useState('2026-11-01');
  const [monthlyRent, setMonthlyRent] = useState(10000);
  const [depositRequired, setDepositRequired] = useState(10000);
  const [depositPaid, setDepositPaid] = useState<number>(0);
  const [depositMethod, setDepositMethod] = useState<'mpesa' | 'cash' | 'bank'>('mpesa');
  const [depositReference, setDepositReference] = useState('');
  const [isDepositWaived, setIsDepositWaived] = useState(false);
  const [depositWaivedReason, setDepositWaivedReason] = useState('');
  const [rentDueDay, setRentDueDay] = useState(settings.defaultDueDay || 5);
  const [error, setError] = useState<string | null>(null);

  // Synchronize and robustly match room selection when rooms load or query params change
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
      // Prioritize vacant room, otherwise fallback to first room
      matchedRoom = rooms.find((r) => r.status === 'vacant') || rooms[0];
    }

    if (matchedRoom) {
      setSelectedRoomId(String(matchedRoom.id));
      const defaultRent = matchedRoom.defaultRent || 10000;
      setMonthlyRent(defaultRent);
      setDepositRequired(defaultRent);
    }
    });
    return () => { active = false; };
  }, [rooms, searchParams, selectedRoomId]);

  const selectedRoom = rooms.find((r) => String(r.id) === String(selectedRoomId));
  const vacantRooms = rooms.filter((r) => r.status === 'vacant');

  const outstandingDeposit = isDepositWaived ? 0 : Math.max(0, depositRequired - depositPaid);
  const firstMonthPreview = calculateFirstMonthRent(monthlyRent, moveInDate);
  const formatRent = (amount: number) =>
    `KSh ${amount.toLocaleString('en-KE', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required');
      return;
    }
    if (!selectedRoomId) {
      setError('Please select an available room');
      return;
    }

    if (isDepositWaived) {
      if (!depositWaivedReason.trim()) {
        setError('Please provide a reason for waiving the security deposit.');
        return;
      }
    } else {
      if (depositPaid < 0) {
        setError('Deposit paid at move-in cannot be negative.');
        return;
      }
      if (depositPaid > depositRequired) {
        setError('Deposit paid at move-in cannot exceed the required deposit amount.');
        return;
      }
      if (depositPaid > 0 && depositMethod === 'mpesa' && !depositReference.trim()) {
        setError('M-Pesa transaction reference is required when recording a deposit payment.');
        return;
      }
    }

    try {
      await registerTenant(
        { fullName: fullName.trim(), phone: phone.trim(), email: email.trim() || undefined },
        {
          roomId: selectedRoomId,
          monthlyRent: Number(monthlyRent),
          depositRequired: isDepositWaived ? 0 : Number(depositRequired),
          depositPaid: isDepositWaived ? 0 : Number(depositPaid),
          depositMethod: !isDepositWaived && depositPaid > 0 ? depositMethod : undefined,
          depositReference: !isDepositWaived && depositPaid > 0 && depositReference.trim() ? depositReference.trim() : undefined,
          depositWaived: isDepositWaived,
          depositWaivedReason: isDepositWaived ? depositWaivedReason.trim() : undefined,
          deposit: isDepositWaived ? 0 : Number(depositPaid),
          startDate: moveInDate,
          rentDueDay: Number(rentDueDay),
        }
      );

      navigate('/rooms');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to register tenant'));
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/rooms')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
      >
        <ArrowLeft size={16} />
        <span>Rooms</span>
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Register tenant</h1>
        <p className="text-sm text-gray-500 mt-1">Create a tenancy at {settings.propertyName}</p>
      </div>

      {/* Room Badge Card */}
      {selectedRoom && (
        <div className="bg-[#EBF5F0]/70 border border-[#CDE5DA] rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-gray-900">{selectedRoom.name}</div>
            <div className="text-xs text-gray-600 mt-0.5">{formatKSh(selectedRoom.defaultRent || 10000)} / month</div>
          </div>
          <Badge variant={selectedRoom.status === 'vacant' ? 'active' : 'neutral'}>
            {selectedRoom.status === 'vacant' ? 'Available' : 'Occupied'}
          </Badge>
        </div>
      )}

      {vacantRooms.length === 0 && rooms.length > 0 && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
          <Info size={16} className="shrink-0 text-amber-600" />
          <span>All rooms at {settings.propertyName} are currently occupied. To register a new tenant, an existing tenancy must first be moved out.</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Tenant Details */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Tenant details</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Enter tenant's full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Phone number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              placeholder="+254 7XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Use a Kenyan number. Contact details shown are illustrative.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Email address (optional)
            </label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            />
          </div>
        </div>

        {/* Section 2: Tenancy & Rent */}
        <div className="space-y-4 pt-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Tenancy & rent</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Assigned room <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedRoomId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedRoomId(newId);
                const r = rooms.find((room) => String(room.id) === String(newId));
                if (r) {
                  const defaultRent = r.defaultRent || 10000;
                  setMonthlyRent(defaultRent);
                  setDepositRequired(defaultRent);
                }
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            >
              {rooms.length === 0 ? (
                <option value="">Loading rooms...</option>
              ) : (
                <>
                  {!selectedRoomId && <option value="">-- Select an available room --</option>}
                  {rooms.map((r) => (
                    <option
                      key={r.id}
                      value={String(r.id)}
                      disabled={r.status === 'occupied' && String(r.id) !== String(selectedRoomId)}
                    >
                      {r.name} - {r.status === 'vacant' ? 'Available' : 'Currently Occupied'}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Move-in date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={moveInDate}
                onChange={(e) => setMoveInDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Monthly rent (KSh) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min={0}
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Monthly rent due date <span className="text-red-500">*</span>
            </label>
            <select
              value={rentDueDay}
              onChange={(e) => setRentDueDay(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            >
              {[1, 5, 10, 15, 20, 25, 28].map((day) => (
                <option key={day} value={day}>
                  Day {day} of each month
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Inherited from rent settings. You can change it for this tenancy.
            </p>
          </div>

          {firstMonthPreview && (
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
              <div className="font-semibold text-gray-900">
                First-month rent{firstMonthPreview.isProrated ? ' (prorated)' : ''}
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Monthly rent</span>
                <span className="font-semibold text-gray-900">{formatRent(firstMonthPreview.monthlyRent)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Move-in date</span>
                <span className="font-semibold text-gray-900">{formatDateShort(firstMonthPreview.moveInDate)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Chargeable days</span>
                <span className="font-semibold text-gray-900">
                  {firstMonthPreview.chargeableDays} of {firstMonthPreview.daysInMonth}
                </span>
              </div>
              <div className="flex justify-between text-brand-900 font-bold pt-1 border-t border-emerald-200">
                <span>{firstMonthPreview.monthLabel} rent</span>
                <span>{formatRent(firstMonthPreview.firstMonthRent)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>From {firstMonthPreview.followingMonthLabel}</span>
                <span className="font-semibold text-gray-900">
                  {formatRent(firstMonthPreview.followingMonthRent)} / month
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                {firstMonthPreview.isProrated
                  ? 'Only the remaining days of the move-in month are charged. Full monthly rent applies from the following month.'
                  : 'Move-in falls on the first day, so the full monthly rent applies.'}
              </p>
            </div>
          )}
        </div>

        {/* Section 3: Security Deposit */}
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Security deposit</h2>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                checked={isDepositWaived}
                onChange={(e) => {
                  const waived = e.target.checked;
                  setIsDepositWaived(waived);
                  if (waived) {
                    setDepositPaid(0);
                  }
                }}
                className="w-4 h-4 text-brand-700 rounded border-gray-300 focus:ring-brand-700"
              />
              <span>Waive deposit</span>
            </label>
          </div>

          {isDepositWaived ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-semibold text-amber-900">
                Security deposit requirement waived
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                This tenant will not be expected to pay a security deposit. Please document the justification for audit records.
              </p>
              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">
                  Reason for waiver <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required={isDepositWaived}
                  placeholder="e.g. Existing agreement, landlord approved exemption"
                  value={depositWaivedReason}
                  onChange={(e) => setDepositWaivedReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Deposit required (KSh) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={depositRequired}
                    onChange={(e) => {
                      const req = Number(e.target.value);
                      setDepositRequired(req);
                      if (depositPaid > req) {
                        setDepositPaid(req);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Pre-filled with room default.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Paid at move-in (KSh)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={depositRequired}
                    value={depositPaid}
                    onChange={(e) => setDepositPaid(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Payment method
                </label>
                <select
                  value={depositMethod}
                  onChange={(e) => setDepositMethod(e.target.value as 'mpesa' | 'cash' | 'bank')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                >
                  <option value="mpesa">M-Pesa</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </div>

              {depositPaid > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Deposit payment reference
                  </label>
                  <input
                    type="text"
                    value={depositReference}
                    onChange={(e) => setDepositReference(e.target.value)}
                    placeholder="e.g. MPESA transaction ID"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                  />
                </div>
              )}

              {outstandingDeposit > 0 && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                  Outstanding deposit due at move-in: <span className="font-semibold">{formatKSh(outstandingDeposit)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-[#EBF5F0]/60 border border-[#CDE5DA] rounded-2xl p-4 flex items-start gap-3 text-xs text-gray-700">
          <Info size={18} className="text-brand-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-gray-900">Ready when you are</div>
            <div className="text-gray-600 mt-0.5">
              Complete the required fields to assign {selectedRoom?.name || 'the room'}. The deposit is recorded separately from rent income.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs transition-colors cursor-pointer"
          >
            <UserPlus size={18} />
            <span>Register & assign {selectedRoom?.name || 'Room'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/rooms')}
            className="w-full py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <p className="text-[11px] text-gray-400 text-center">
            * Required fields · Draft tenancy, not yet saved
          </p>
        </div>
      </form>
    </div>
  );
};
