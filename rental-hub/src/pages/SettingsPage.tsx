import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Lock, Calendar, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useRental } from '../context/useRental';
import { getErrorMessage } from '../services/api';
import { Badge } from '../components/common/Badge';
import { formatMonthYear } from '../utils/format';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, rooms, updateSettings, generateMonthlyCharges, selectedMonth } = useRental();

  const [autoGen, setAutoGen] = useState(settings.autoGenerateCharges);
  const [dueDay, setDueDay] = useState(settings.defaultDueDay);
  const [landlordPhone, setLandlordPhone] = useState(settings.landlordPhone || '');
  const [landlordEmail, setLandlordEmail] = useState(settings.landlordEmail || '');
  const [roomRents, setRoomRents] = useState<Record<string, number>>({
    '01': settings.roomRents['01'] || 10000,
    '02': settings.roomRents['02'] || 10000,
    '03': settings.roomRents['03'] || 10000,
    '04': settings.roomRents['04'] || 10000,
    '05': settings.roomRents['05'] || 10000,
    '06': settings.roomRents['06'] || 10000,
  });

  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const potentialRent = Object.values(roomRents).reduce((sum, r) => sum + (Number(r) || 0), 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        autoGenerateCharges: autoGen,
        defaultDueDay: Number(dueDay),
        landlordPhone: landlordPhone.trim(),
        landlordEmail: landlordEmail.trim(),
        roomRents,
      });
      setSavedMessage('Settings saved successfully');
      setTimeout(() => setSavedMessage(null), 3000);
    } catch (err: unknown) {
      setSavedMessage(getErrorMessage(err, 'Failed to save settings'));
      setTimeout(() => setSavedMessage(null), 4000);
    }
  };

  const handleGenerate = async () => {
    try {
      await generateMonthlyCharges(selectedMonth);
      setSavedMessage(`Monthly charges verified for ${selectedMonth}.`);
      setTimeout(() => setSavedMessage(null), 3000);
    } catch (err: unknown) {
      setSavedMessage(getErrorMessage(err, 'Failed to generate charges'));
      setTimeout(() => setSavedMessage(null), 4000);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
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
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Rent settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">{settings.propertyName} · Simple monthly defaults</p>
      </div>

      {/* More Workflows Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          MORE WORKFLOWS
        </div>
        <div className="flex items-center justify-between text-xs font-semibold text-brand-700">
          <button onClick={() => navigate('/rent-charges')} className="hover:underline flex items-center gap-0.5">
            <span>Rent charges</span>
            <ArrowRight size={14} />
          </button>
          <button onClick={() => navigate('/expenses')} className="hover:underline flex items-center gap-0.5">
            <span>Expenses</span>
            <ArrowRight size={14} />
          </button>
          <button onClick={() => navigate('/reports')} className="hover:underline flex items-center gap-0.5">
            <span>Reports</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {savedMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-brand-700 rounded-xl text-xs font-semibold">
          <CheckCircle2 size={16} />
          <span>{savedMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Monthly Charges Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Monthly charges</h2>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-900">Generate automatically</div>
              <div className="text-[11px] text-gray-500 mt-0.5">On the 1st, for occupied rooms only</div>
              <Badge variant="active" className="mt-1.5">
                {autoGen ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => setAutoGen(!autoGen)}
              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                autoGen ? 'bg-brand-700' : 'bg-gray-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  autoGen ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Default due date</label>
            <select
              value={dueDay}
              onChange={(e) => setDueDay(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            >
              {[1, 5, 10, 15, 20, 25, 28].map((day) => (
                <option key={day} value={day}>
                  Day {day} of each month
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              New tenancies inherit this date. Existing charge due dates stay unchanged.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#CDE5DA] bg-[#EBF5F0]/60 hover:bg-[#EBF5F0] text-brand-700 font-semibold text-xs transition-colors cursor-pointer"
            >
              <Calendar size={16} />
              <span>Generate monthly charges</span>
            </button>
            <p className="text-[11px] text-gray-400 mt-1.5 text-center">
              {formatMonthYear(selectedMonth)}: charges up to date. No duplicates will be created.
            </p>
          </div>
        </div>

        {/* Currency Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Currency</h2>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Reporting currency</label>
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-gray-50 text-sm text-gray-700">
              <span>KES · Kenyan Shilling</span>
              <Lock size={16} className="text-gray-400" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Amounts are displayed as KSh throughout RentalHub.
            </p>
          </div>
        </div>

        {/* Landlord Contact Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Landlord contact</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Used in rent reminder messages sent via WhatsApp and SMS.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Phone number
            </label>
            <input
              type="tel"
              value={landlordPhone}
              onChange={(e) => setLandlordPhone(e.target.value)}
              placeholder="+254712345678"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Include country code, e.g. +254712345678. Shown in reminder messages.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Email address
            </label>
            <input
              type="email"
              value={landlordEmail}
              onChange={(e) => setLandlordEmail(e.target.value)}
              placeholder="landlord@example.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            />
          </div>
        </div>

        {/* Room Rents Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Room rents</h2>
          <p className="text-xs text-gray-500">Monthly rent in KSh. Changes apply to future charges.</p>

          <div className="space-y-2.5 pt-1">
            {rooms.map((room) => (
              <div key={room.id} className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900">{room.name}</div>
                  <div className="text-[11px] text-gray-400 capitalize">{room.status}</div>
                </div>
                <input
                  type="number"
                  min={0}
                  value={roomRents[room.number] || 10000}
                  onChange={(e) =>
                    setRoomRents({
                      ...roomRents,
                      [room.number]: Number(e.target.value),
                    })
                  }
                  className="w-28 px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-right text-xs font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                />
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-gray-900">
            <span>Potential · 6 occupied rooms</span>
            <span>KSh {potentialRent.toLocaleString('en-KE')}</span>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs transition-colors cursor-pointer"
        >
          <Check size={18} />
          <span>Save settings</span>
        </button>
      </form>
    </div>
  );
};
