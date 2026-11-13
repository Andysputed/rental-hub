import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, ChevronRight, Settings, DoorClosed, LogOut } from 'lucide-react';
import { useRental } from '../context/useRental';
import { Badge } from '../components/common/Badge';
import { RoomBadge } from '../components/common/RoomBadge';
import { MoveOutModal } from '../components/common/MoveOutModal';
import { MonthSelector } from '../components/common/MonthSelector';
import { formatKSh, formatMonthYear, formatMonthShort, formatDateShort } from '../utils/format';

export const RoomsPage: React.FC = () => {
  const navigate = useNavigate();
  const { rooms, tenants, tenancies, rentCharges, settings, totalRentCharged, totalRentReceived, totalOutstanding, moveOutTenant, selectedMonth, setSelectedMonth } =
    useRental();

  const [filter, setFilter] = useState<'all' | 'occupied' | 'vacant'>('all');
  const [moveOutTarget, setMoveOutTarget] = useState<{
    id: string;
    roomId: string;
    tenantName: string;
    roomName: string;
    startDate: string;
  } | null>(null);

  const occupiedCount = rooms.filter((r) => r.status === 'occupied').length;
  const vacantCount = rooms.filter((r) => r.status === 'vacant').length;
  const occupancyPercentage = rooms.length > 0 ? Math.round((occupiedCount / rooms.length) * 100) : 0;
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');

  const filteredRooms = rooms.filter((room) => {
    if (filter === 'occupied') return room.status === 'occupied';
    if (filter === 'vacant') return room.status === 'vacant';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            <span className="md:hidden">Rooms</span>
            <span className="hidden md:inline">Six rooms. One clear picture.</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="md:hidden">{settings.propertyName} · All 6 rooms</span>
            <span className="hidden md:inline">Manage occupancy, tenants and monthly rent at {settings.propertyName}.</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/rooms/register')}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-700 hover:bg-[#0D3F34] text-white text-sm font-semibold shadow-2xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <UserPlus size={18} />
          <span>Register tenant</span>
        </button>
      </div>

      {/* Month Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <MonthSelector currentMonth={selectedMonth} onChange={setSelectedMonth} className="w-full sm:w-64" />
        <span className="hidden md:inline text-xs text-gray-500 font-medium">
          {settings.propertyName} · 6 rooms · {formatMonthYear(selectedMonth)}
        </span>
      </div>

      {/* Desktop Stat Cards */}
      <div className="hidden md:grid grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Occupied rooms</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {occupiedCount} of {rooms.length}
          </div>
          <div className="text-xs text-gray-400 mt-2">{occupancyPercentage}% occupancy</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Vacant rooms</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {vacantCount} {vacantCount === 1 ? 'room' : 'rooms'}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            {vacantCount > 0 ? 'Ready to assign a tenant' : 'Fully occupied property'}
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Occupied monthly rent</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatKSh(totalRentCharged)}</div>
          <div className="text-xs text-gray-400 mt-2">Current billing period</div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
          <div className="text-xs text-gray-500 font-medium">Potential full occupancy</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {formatKSh(rooms.reduce((acc, r) => acc + (r.defaultRent || 10000), 0))}
          </div>
          <div className="text-xs text-gray-400 mt-2">All 6 rooms combined</div>
        </div>
      </div>

      {/* Mobile Occupancy Overview Card */}
      <div className="md:hidden bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center justify-between text-xs font-medium mb-3">
          <span className="text-sm font-bold text-gray-900">
            {occupiedCount} of {rooms.length} occupied
          </span>
          <span className="text-gray-500">{occupancyPercentage}% occupancy</span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {rooms.map((room) => (
            <RoomBadge
              key={room.id}
              number={room.number}
              isOccupied={room.status === 'occupied'}
              onClick={() => {
                if (room.status === 'occupied') {
                  navigate(`/rooms/${room.id}`);
                } else {
                  navigate(`/rooms/register?roomId=${room.id}`);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-[#EBF5F0] text-brand-700 font-semibold border border-[#CDE5DA]'
                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
            }`}
          >
            All rooms · {rooms.length}
          </button>
          <button
            onClick={() => setFilter('occupied')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              filter === 'occupied'
                ? 'bg-[#EBF5F0] text-brand-700 font-semibold border border-[#CDE5DA]'
                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
            }`}
          >
            Occupied · {occupiedCount}
          </button>
          <button
            onClick={() => setFilter('vacant')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              filter === 'vacant'
                ? 'bg-[#EBF5F0] text-brand-700 font-semibold border border-[#CDE5DA]'
                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
            }`}
          >
            Vacant · {vacantCount}
          </button>
        </div>

        <span className="hidden md:inline text-xs text-gray-400">
          {formatMonthYear(selectedMonth)} rent · Amounts in KSh
        </span>
      </div>

      {/* Mobile Room Cards List */}
      <div className="md:hidden space-y-3">
        {filteredRooms.map((room) => {
          const tenancy = tenancies.find((t) => String(t.roomId) === String(room.id) && t.status === 'active');
          const tenant = tenancy ? tenants.find((t) => String(t.id) === String(tenancy.tenantId)) : undefined;
          const charge = tenancy
            ? rentCharges.find((c) => String(c.tenancyId) === String(tenancy.id) && c.month === selectedMonth)
            : undefined;
          const balance = charge ? charge.amount - charge.paidAmount : 0;

          if (room.status === 'vacant') {
            return (
              <div
                key={room.id}
                className="bg-[#F8FAF9] border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">{room.name}</span>
                  <Badge variant="vacant">Vacant</Badge>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900">Ready for a new tenant</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatKSh(room.defaultRent)} / month. No tenant assigned and no {formatMonthShort(selectedMonth)} rent charged.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/rooms/register?roomId=${room.id}`)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-sm shadow-2xs cursor-pointer"
                >
                  <UserPlus size={16} />
                  <span>Register tenant</span>
                </button>
              </div>
            );
          }

          return (
            <div
              key={room.id}
              onClick={() => navigate(`/rooms/${room.id}`)}
              className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs cursor-pointer hover:border-gray-300 transition-all space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">{room.name}</span>
                <Badge variant="active">Occupied</Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-900 hover:text-brand-700">
                  {tenant?.fullName}
                </span>
                <ChevronRight size={18} className="text-gray-400" />
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100">
                <span className="text-gray-500">
                  {formatKSh(charge ? charge.amount : (tenancy?.monthlyRent || room.defaultRent))} / month
                </span>
                <div className="flex items-center gap-2">
                  {charge ? (
                    balance === 0 ? (
                      <span className="font-semibold text-[#0D5B46]">{formatMonthShort(selectedMonth)} paid</span>
                    ) : charge.dueDate <= today ? (
                      <span className="font-semibold text-amber-text">Overdue · {formatKSh(balance)}</span>
                    ) : (
                      <span className="font-semibold text-gray-600">
                        Due {formatDateShort(charge.dueDate)} · {formatKSh(balance)}
                      </span>
                    )
                  ) : (
                    <span className="font-semibold text-gray-400">Not charged</span>
                  )}
                  {tenancy && tenant && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoveOutTarget({
                          id: String(tenancy.id),
                          roomId: String(room.id),
                          tenantName: tenant.fullName,
                          roomName: room.name,
                          startDate: tenancy.startDate,
                        });
                      }}
                      className="p-1 rounded-md text-amber-700 hover:bg-amber-50"
                      title="Move Out"
                    >
                      <LogOut size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white border border-[#E5E7EB] rounded-2xl shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 text-gray-400 font-semibold uppercase tracking-wider">
              <th className="py-3 px-5">Room</th>
              <th className="py-3 px-5">Tenant</th>
              <th className="py-3 px-5">Occupancy</th>
              <th className="py-3 px-5 text-right">Monthly Rent</th>
              <th className="py-3 px-5 text-right">Paid</th>
              <th className="py-3 px-5 text-right">Balance</th>
              <th className="py-3 px-5 text-right">Rent Status</th>
              <th className="py-3 px-5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRooms.map((room) => {
              const tenancy = tenancies.find((t) => String(t.roomId) === String(room.id) && t.status === 'active');
              const tenant = tenancy ? tenants.find((t) => String(t.id) === String(tenancy.tenantId)) : undefined;
              const charge = tenancy
                ? rentCharges.find((c) => String(c.tenancyId) === String(tenancy.id) && c.month === selectedMonth)
                : undefined;
              const balance = charge ? charge.amount - charge.paidAmount : 0;

              return (
                <tr
                  key={room.id}
                  onClick={() => {
                    if (room.status === 'occupied') {
                      navigate(`/rooms/${room.id}`);
                    } else {
                      navigate(`/rooms/register?roomId=${room.id}`);
                    }
                  }}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="py-4 px-5 font-bold text-gray-900">{room.name}</td>
                  <td className="py-4 px-5">
                    {tenant ? (
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#EBF5F0] text-brand-700 font-semibold text-[11px] flex items-center justify-center">
                          {tenant.initials}
                        </span>
                        <span className="font-semibold text-gray-900">{tenant.fullName}</span>
                      </div>
                    ) : (
                      <div>
                        <div className="text-gray-400">No tenant assigned</div>
                        <span className="text-[11px] font-semibold text-brand-700 hover:underline">
                          Register tenant →
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-5">
                    <Badge variant={room.status === 'occupied' ? 'active' : 'vacant'}>
                      {room.status === 'occupied' ? 'Occupied' : 'Vacant'}
                    </Badge>
                  </td>
                  <td className="py-4 px-5 text-right font-semibold text-gray-900">
                    {(charge ? charge.amount : (tenancy?.monthlyRent || room.defaultRent)).toLocaleString('en-KE')}
                  </td>
                  <td className="py-4 px-5 text-right text-gray-600">
                    {charge ? charge.paidAmount.toLocaleString('en-KE') : '—'}
                  </td>
                  <td className="py-4 px-5 text-right font-semibold">
                    {charge ? (
                      balance === 0 ? (
                        <span className="text-gray-900">0</span>
                      ) : (
                        <span className="text-amber-text">{balance.toLocaleString('en-KE')}</span>
                      )
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-4 px-5 text-right">
                    {charge ? (
                      balance === 0 ? (
                        <Badge variant="paid">Paid</Badge>
                      ) : charge.dueDate <= today ? (
                        <Badge variant="overdue">Overdue</Badge>
                      ) : (
                        <Badge variant="neutral">Due {formatDateShort(charge.dueDate)}</Badge>
                      )
                    ) : (
                      <span className="text-xs text-gray-400">Not charged</span>
                    )}
                  </td>
                  <td className="py-4 px-5 text-center">
                    {room.status === 'occupied' && tenancy && tenant ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoveOutTarget({
                            id: String(tenancy.id),
                            roomId: String(room.id),
                            tenantName: tenant.fullName,
                            roomName: room.name,
                            startDate: tenancy.startDate,
                          });
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <LogOut size={12} />
                        <span>Move out</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/rooms/register?roomId=${room.id}`);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
                      >
                        <UserPlus size={12} />
                        <span>Assign</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Desktop Table Footer */}
        <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div>
            {occupiedCount} occupied · {vacantCount} vacant · Due {settings.defaultDueDay || 5} {formatMonthShort(selectedMonth)}
          </div>
          <div className="flex items-center gap-6">
            <div>
              Received <span className="font-semibold text-gray-900">{totalRentReceived.toLocaleString('en-KE')}</span>
            </div>
            <div>
              Outstanding{' '}
              <span className="font-semibold text-amber-text">{totalOutstanding.toLocaleString('en-KE')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Bottom Action Cards */}
      <div className="hidden md:grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-[#EBF5F0]/60 border border-[#CDE5DA] rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white border border-[#CDE5DA] flex items-center justify-center text-brand-700">
              <DoorClosed size={24} />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">
                {vacantCount > 0
                  ? `${rooms.find((r) => r.status === 'vacant')?.name || 'A room'} is ready for its next tenant`
                  : 'All rooms currently occupied'}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                Assign the available room when you register a new tenancy.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const vacant = rooms.find((r) => r.status === 'vacant');
              if (vacant) {
                navigate(`/rooms/register?roomId=${vacant.id}`);
              } else {
                navigate('/rooms/register');
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-700 hover:bg-[#0D3F34] text-white text-xs font-semibold shadow-2xs cursor-pointer"
          >
            <UserPlus size={16} />
            <span>Register & assign tenant</span>
          </button>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-gray-900">Rent defaults</div>
            <button
              onClick={() => navigate('/settings')}
              className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Settings</span>
              <Settings size={12} />
            </button>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Monthly rent, each room</span>
            <span className="font-semibold text-gray-900">KSh 10,000</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Default due date</span>
            <span className="font-semibold text-gray-900">Day 5</span>
          </div>
          <div className="text-[11px] text-gray-400 pt-1">
            Only occupied rooms receive monthly charges. Vacant rooms have no tenant balance.
          </div>
        </div>
      </div>

      {/* Move Out Confirmation Dialog */}
      {moveOutTarget && (
        <MoveOutModal
          isOpen={!!moveOutTarget}
          onClose={() => setMoveOutTarget(null)}
          onConfirm={async (tenancyId, data) => {
            await moveOutTenant(tenancyId, data);
          }}
          tenancy={moveOutTarget}
        />
      )}
    </div>
  );
};
