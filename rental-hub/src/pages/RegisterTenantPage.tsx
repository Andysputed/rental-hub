import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, UserPlus, Info } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { Badge } from '../components/common/Badge';
import { formatKSh } from '../utils/format';

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
  const [deposit, setDeposit] = useState(10000);
  const [rentDueDay, setRentDueDay] = useState(settings.defaultDueDay || 5);
  const [error, setError] = useState<string | null>(null);

  // Synchronize and robustly match room selection when rooms load or query params change
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
      // Prioritize vacant room, otherwise fallback to first room
      matchedRoom = rooms.find((r) => r.status === 'vacant') || rooms[0];
    }

    if (matchedRoom) {
      setSelectedRoomId(String(matchedRoom.id));
      setMonthlyRent(matchedRoom.defaultRent || 10000);
      setDeposit(matchedRoom.defaultRent || 10000);
    }
  }, [rooms, searchParams]);

  const selectedRoom = rooms.find((r) => String(r.id) === String(selectedRoomId));
  const vacantRooms = rooms.filter((r) => r.status === 'vacant');

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

    try {
      await registerTenant(
        { fullName: fullName.trim(), phone: phone.trim(), email: email.trim() || undefined },
        {
          roomId: selectedRoomId,
          monthlyRent: Number(monthlyRent),
          deposit: Number(deposit),
          startDate: moveInDate,
          rentDueDay: Number(rentDueDay),
        }
      );

      navigate('/rooms');
    } catch (err: any) {
      setError(err?.message || 'Failed to register tenant');
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
                  setMonthlyRent(r.defaultRent || 10000);
                  setDeposit(r.defaultRent || 10000);
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

          <div className="grid grid-cols-2 gap-3">
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
              <label className="block text-xs font-semibold text-gray-700 mb-1">Deposit (KSh)</label>
              <input
                type="number"
                min={0}
                value={deposit}
                onChange={(e) => setDeposit(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
              />
            </div>
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
