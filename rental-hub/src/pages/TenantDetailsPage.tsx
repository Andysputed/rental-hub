import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MessageSquare, Plus, FileText, ChevronRight, LogOut, UserPlus, Info, History } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { Badge } from '../components/common/Badge';
import { MoveOutModal } from '../components/common/MoveOutModal';
import { formatKSh, formatDateShort } from '../utils/format';

export const TenantDetailsPage: React.FC = () => {
  const { roomId, tenantId } = useParams<{ roomId?: string; tenantId?: string }>();
  const navigate = useNavigate();
  const { rooms, tenants, tenancies, rentCharges, payments, deposits, settings, moveOutTenant } = useRental();

  const [isMoveOutOpen, setIsMoveOutOpen] = useState(false);

  // Determine mode: by tenant ID or by room ID
  const isTenantView = Boolean(tenantId);

  let room = undefined;
  let tenant = undefined;
  let tenancy = undefined;
  let pastTenanciesForRoom: typeof tenancies = [];

  if (isTenantView) {
    tenant = tenants.find((t) => String(t.id) === String(tenantId));
    const tenantTenancies = tenancies.filter((t) => String(t.tenantId) === String(tenant?.id));
    const activeTenancy = tenantTenancies.find((t) => t.status === 'active');
    tenancy = activeTenancy || tenantTenancies[0];
    room = rooms.find((r) => String(r.id) === String(tenancy?.roomId));
  } else {
    room = rooms.find((r) => String(r.id) === String(roomId) || r.number === roomId);
    const activeTenancy = tenancies.find((t) => String(t.roomId) === String(room?.id) && t.status === 'active');
    pastTenanciesForRoom = tenancies.filter((t) => String(t.roomId) === String(room?.id) && t.status === 'ended');
    tenancy = activeTenancy; // Only active tenancy represents the current occupant!
    tenant = tenancy ? tenants.find((t) => String(t.id) === String(tenancy.tenantId)) : undefined;
  }

  // Not found states
  if (isTenantView && !tenant) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Tenant not found</h2>
        <button
          onClick={() => navigate('/tenants')}
          className="px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          Back to Tenants
        </button>
      </div>
    );
  }

  if (!isTenantView && !room) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Room not found</h2>
        <button
          onClick={() => navigate('/rooms')}
          className="px-4 py-2 bg-brand-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          Back to Rooms
        </button>
      </div>
    );
  }

  // Vacant room with no active tenancy
  if (!isTenantView && (!tenant || !tenancy)) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <button
          type="button"
          onClick={() => navigate('/rooms')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Rooms</span>
        </button>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{room?.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{settings.propertyName}</p>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-2xs space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mx-auto">
            <UserPlus size={24} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">{room?.name} is currently vacant</h2>
            <p className="text-xs text-gray-500 mt-1">
              Monthly rent: {formatKSh(room?.defaultRent || 10000)} · Ready to assign a new tenant
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/rooms/register?roomId=${room?.id}`)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            <UserPlus size={16} />
            <span>Register tenant for {room?.name}</span>
          </button>
        </div>

        {/* Previous Occupants of this room */}
        {pastTenanciesForRoom.length > 0 && (
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History size={16} className="text-gray-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">Past tenancies in this room</h3>
              </div>
              <span className="text-[11px] text-gray-400">{pastTenanciesForRoom.length} recorded</span>
            </div>

            <div className="divide-y divide-gray-100 text-xs">
              {pastTenanciesForRoom.map((pastT) => {
                const pastTenant = tenants.find((t) => String(t.id) === String(pastT.tenantId));
                return (
                  <div key={pastT.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{pastTenant?.fullName || 'Former tenant'}</div>
                      <div className="text-[11px] text-gray-400">
                        {formatDateShort(pastT.startDate)} – {pastT.endDate ? formatDateShort(pastT.endDate) : 'Ended'}
                      </div>
                    </div>
                    {pastTenant && (
                      <button
                        type="button"
                        onClick={() => navigate(`/tenants/${pastTenant.id}`)}
                        className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>View tenant ledger</span>
                        <ChevronRight size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Strict tenancy isolation: charges and payments belong strictly to THIS tenancy!
  const charge = tenancy
    ? rentCharges.find((c) => String(c.tenancyId) === String(tenancy.id) && c.month === '2026-10')
    : undefined;
  const tenantPayments = tenancy
    ? payments.filter((p) => String(p.tenancyId) === String(tenancy.id))
    : [];

  const balance = charge ? charge.amount - charge.paidAmount : 0;
  const isOverdue = charge && charge.status === 'overdue' && balance > 0;
  const isActive = tenancy?.status === 'active';

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate(isTenantView ? '/tenants' : '/rooms')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
      >
        <ArrowLeft size={16} />
        <span>{isTenantView ? 'Tenants' : 'Rooms'}</span>
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            {isActive ? 'Tenant details' : 'Former tenant profile'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {settings.propertyName} · {room?.name || 'Acacia House'}
          </p>
        </div>

        {isActive && tenancy && (
          <button
            type="button"
            onClick={() => setIsMoveOutOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            <span>Move Out</span>
          </button>
        )}
      </div>

      {/* Former Tenancy Banner */}
      {!isActive && tenancy && (
        <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-gray-700">
            <Info size={16} className="text-gray-400 shrink-0" />
            <span>
              This tenancy ended on {tenancy.endDate ? formatDateShort(tenancy.endDate) : 'record'}. Historical records and arrears are preserved.
            </span>
          </div>
          {room && room.status === 'vacant' && (
            <button
              type="button"
              onClick={() => navigate(`/rooms/register?roomId=${room.id}`)}
              className="ml-3 shrink-0 font-semibold text-brand-700 hover:underline"
            >
              Assign room
            </button>
          )}
        </div>
      )}

      {/* Tenant Profile Card */}
      {tenant && (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-[#EBF5F0] text-brand-700 font-bold text-base flex items-center justify-center">
              {tenant.initials}
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">{tenant.fullName}</div>
              <Badge variant={isActive ? 'active' : 'former'} className="mt-1">
                {isActive ? 'Active tenancy' : 'Former tenant'}
              </Badge>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-gray-600 pt-2 border-t border-gray-100">
            <div className="flex justify-between">
              <span className="text-gray-400">Phone</span>
              <span className="font-semibold text-gray-900">{tenant.phone}</span>
            </div>
            {tenant.email && (
              <div className="flex justify-between">
                <span className="text-gray-400">Email</span>
                <span className="font-semibold text-gray-900">{tenant.email}</span>
              </div>
            )}
            <div className="text-[11px] text-gray-400 pt-1">Personal details strictly isolated per tenant</div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <a
              href={`tel:${tenant.phone}`}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[#E5E7EB] hover:bg-gray-50 text-xs font-semibold text-gray-800 transition-colors"
            >
              <Phone size={14} className="text-brand-700" />
              <span>Call</span>
            </a>
            <a
              href={`sms:${tenant.phone}`}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[#E5E7EB] hover:bg-gray-50 text-xs font-semibold text-gray-800 transition-colors"
            >
              <MessageSquare size={14} className="text-brand-700" />
              <span>Message</span>
            </a>
          </div>
        </div>
      )}

      {/* Balance Card */}
      <div
        className={`rounded-2xl p-5 border shadow-2xs space-y-3 ${
          isOverdue ? 'bg-[#FEF8EE] border-[#FED7AA]' : 'bg-white border-[#E5E7EB]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-600">
            {isActive ? 'October balance' : 'Outstanding historical balance'}
          </span>
          <Badge variant={isOverdue ? 'overdue' : charge ? 'paid' : 'neutral'}>
            {isOverdue ? 'Overdue' : charge ? 'Paid' : 'No charges for October'}
          </Badge>
        </div>

        <div>
          <div className="text-3xl font-bold text-gray-900 tracking-tight">{formatKSh(balance)}</div>
          {isOverdue && (
            <div className="text-xs text-amber-text font-medium mt-1">
              Due {charge?.dueDate ? formatDateShort(charge.dueDate) : '5 Oct'} · Outstanding on this tenancy
            </div>
          )}
          {!charge && (
            <div className="text-xs text-gray-500 font-medium mt-1">
              Clean ledger. No rent charge generated yet for October.
            </div>
          )}
        </div>

        <div className="space-y-1 text-xs pt-2 border-t border-gray-200/60">
          <div className="flex justify-between text-gray-600">
            <span>Rent charged</span>
            <span className="font-semibold text-gray-900">{formatKSh(charge?.amount || 0)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Rent received</span>
            <span className="font-semibold text-gray-900">{formatKSh(charge?.paidAmount || 0)}</span>
          </div>
        </div>

        {balance > 0 && isActive && room && (
          <button
            type="button"
            onClick={() => navigate(`/payments/record?roomId=${room.id}`)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-700 hover:bg-[#0D3F34] text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer mt-2"
          >
            <Plus size={16} />
            <span>Record payment</span>
          </button>
        )}
      </div>

      {/* Tenancy Section Card */}
      {tenancy && (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Tenancy details</h2>
            {isActive && (
              <button
                type="button"
                onClick={() => setIsMoveOutOpen(true)}
                className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer flex items-center gap-1"
              >
                <LogOut size={13} />
                <span>Move out</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-100 text-xs">
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Room</span>
              <span className="font-semibold text-gray-900">{room?.name || 'Unassigned'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Move-in date</span>
              <span className="font-semibold text-gray-900">
                {formatDateShort(tenancy.startDate)}
              </span>
            </div>
            {tenancy.endDate && (
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Move-out date</span>
                <span className="font-semibold text-gray-900">
                  {formatDateShort(tenancy.endDate)}
                </span>
              </div>
            )}
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Monthly rent</span>
              <span className="font-semibold text-gray-900">
                {formatKSh(tenancy.monthlyRent || 10000)}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Rent due</span>
              <span className="font-semibold text-gray-900">
                Day {tenancy.rentDueDay || 5}, every month
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Deposit held</span>
              <span className="font-semibold text-gray-900">
                {formatKSh(tenancy.deposit || 0)}
              </span>
            </div>
            {(() => {
              const dep = deposits.find((d) => String(d.tenancyId) === String(tenancy.id));
              if (!dep) return null;
              return (
                <>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-500">Deposit status</span>
                    <span className="font-semibold text-gray-900 capitalize">{dep.status}</span>
                  </div>
                  {dep.status !== 'held' && (
                    <>
                      {dep.rentDeducted > 0 && (
                        <div className="flex justify-between py-2 text-amber-800">
                          <span>Rent arrears deducted</span>
                          <span className="font-semibold">- {formatKSh(dep.rentDeducted)}</span>
                        </div>
                      )}
                      {dep.repairsDeducted > 0 && (
                        <div className="flex justify-between py-2 text-amber-800">
                          <span>Repairs deducted</span>
                          <span className="font-semibold">- {formatKSh(dep.repairsDeducted)}</span>
                        </div>
                      )}
                      {dep.refundAmount > 0 && (
                        <div className="flex justify-between py-2 text-brand-700">
                          <span>Refund disbursed</span>
                          <span className="font-bold">{formatKSh(dep.refundAmount)}</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Status</span>
              <span className="font-semibold text-gray-900 capitalize">{tenancy.status}</span>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 pt-1 border-t border-gray-100">
            Security deposit is held separately from rent revenue and belongs to this specific tenancy.
          </div>
        </div>
      )}

      {/* Payment History Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Payment history</h2>
          <span className="text-xs text-gray-500">{tenantPayments.length} payment(s)</span>
        </div>

        {tenantPayments.length === 0 ? (
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 text-center text-xs text-gray-400">
            No payments recorded for this tenancy.
          </div>
        ) : (
          tenantPayments.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">{formatKSh(p.amount)}</span>
                <Badge variant={p.method === 'mpesa' ? 'mpesa' : p.method === 'cash' ? 'cash' : 'bank'}>
                  {p.method === 'mpesa' ? 'M-Pesa' : p.method === 'cash' ? 'Cash' : 'Bank transfer'}
                </Badge>
              </div>

              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span className="text-gray-400">Received</span>
                  <span className="font-semibold text-gray-900">{formatDateShort(p.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Reference</span>
                  <span className="font-semibold text-gray-900">{p.reference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Allocation</span>
                  <span className="font-semibold text-gray-900">Rent payment</span>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => navigate(`/payments/receipt/${p.id}`)}
                  className="w-full flex items-center justify-between py-1 text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <FileText size={15} />
                    <span>View receipt {p.receiptNumber}</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Move Out Confirmation Dialog */}
      {isActive && tenancy && tenant && room && (
        <MoveOutModal
          isOpen={isMoveOutOpen}
          onClose={() => setIsMoveOutOpen(false)}
          onConfirm={async (tenancyId, data) => {
            await moveOutTenant(tenancyId, data);
          }}
          tenancy={{
            id: String(tenancy.id),
            roomId: String(room.id),
            tenantName: tenant.fullName,
            roomName: room.name,
            startDate: tenancy.startDate,
          }}
        />
      )}
    </div>
  );
};
