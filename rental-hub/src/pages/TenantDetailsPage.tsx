import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MessageSquare, Plus, FileText, ChevronRight, LogOut, UserPlus, Info, History } from 'lucide-react';
import { useRental } from '../context/useRental';
import { Badge } from '../components/common/Badge';
import { MoveOutModal } from '../components/common/MoveOutModal';
import { RecordDepositPaymentModal } from '../components/common/RecordDepositPaymentModal';
import { formatKSh, formatDateShort, formatMonthYear, formatMonthShort } from '../utils/format';
import { getWhatsAppNumber, normalizeKenyanPhone, isValidPhone } from '../utils/phone';
import { generateRentReminder } from '../utils/messages';

export const TenantDetailsPage: React.FC = () => {
  const { roomId, tenantId } = useParams<{ roomId?: string; tenantId?: string }>();
  const navigate = useNavigate();
  const { rooms, tenants, tenancies, rentCharges, payments, deposits, settings, moveOutTenant, selectedMonth } = useRental();

  const [isMoveOutOpen, setIsMoveOutOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

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
    && selectedMonth >= tenancy.startDate.slice(0, 7)
    && (!tenancy.endDate || selectedMonth <= tenancy.endDate.slice(0, 7))
    ? rentCharges.find((c) => String(c.tenancyId) === String(tenancy.id) && c.month === selectedMonth)
    : undefined;
  const tenantPayments = tenancy
    ? payments.filter((p) => String(p.tenancyId) === String(tenancy.id))
    : [];
  const currentDate = new Date();
  const localToday = [currentDate.getFullYear(), String(currentDate.getMonth() + 1).padStart(2, '0'), String(currentDate.getDate()).padStart(2, '0')].join('-');
  const receivedTotal = tenantPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const allocatedTotal = tenantPayments.reduce((sum, payment) => sum + (payment.isReversed ? 0 :
    (payment.allocations || []).reduce((subtotal, allocation) => subtotal + Number(allocation.amount), 0)), 0);
  const availableAdvance = tenantPayments.reduce((sum, payment) => sum + (payment.isReversed ? 0 : Number(payment.availableCredit || 0)), 0);
  const reservedFuture = tenantPayments.reduce((sum, payment) => sum + (payment.isReversed ? 0 :
    (payment.reservations || []).filter((reservation) => reservation.status === 'reserved')
      .reduce((subtotal, reservation) => subtotal + Number(reservation.remainingAmount), 0)), 0);
  const refundsTotal = tenantPayments.reduce((sum, payment) => sum +
    (payment.refunds || []).reduce((subtotal, refund) => subtotal + Number(refund.amount), 0), 0);
  const reversedTotal = tenantPayments.reduce((sum, payment) => sum + (payment.isReversed ? Number(payment.amount) : 0), 0);

  const balance = charge ? charge.amount - charge.paidAmount : 0;
  const isOverdue = charge && charge.dueDate <= localToday && balance > 0;
  const isActive = tenancy?.status === 'active';

  // All unpaid/partial/overdue charges for this tenancy (for reminder message)
  const overdueCharges = tenancy
    ? rentCharges
        .filter(
          (c) =>
            String(c.tenancyId) === String(tenancy.id) &&
            c.dueDate <= localToday &&
            c.month >= tenancy.startDate.slice(0, 7) &&
            (!tenancy.endDate || c.month <= tenancy.endDate.slice(0, 7)) &&
            (c.status === 'overdue' || c.status === 'unpaid' || c.status === 'partial') &&
            c.amount - c.paidAmount > 0
        )
        .map((c) => ({
          month: c.month,
          balance: c.amount - c.paidAmount,
          dueDate: c.dueDate,
        }))
    : [];
  const totalOverdueBalance = overdueCharges.reduce((sum, c) => sum + c.balance, 0);

  // Phone utility helpers
  const phoneValid = isValidPhone(tenant?.phone);
  const waNumber = getWhatsAppNumber(tenant?.phone);
  const smsPhone = normalizeKenyanPhone(tenant?.phone);

  // Build reminder message (only when there are overdue charges and a valid phone)
  const reminderMessage =
    tenant && overdueCharges.length > 0
      ? generateRentReminder({
          tenantName: tenant.fullName,
          roomName: room?.name || '',
          propertyName: settings.propertyName,
          totalBalance: totalOverdueBalance,
          charges: overdueCharges,
          landlordName: settings.landlordName,
          landlordPhone: settings.landlordPhone || undefined,
        })
      : null;

  const encodedReminder = reminderMessage ? encodeURIComponent(reminderMessage) : '';
  const whatsAppReminderHref =
    waNumber && reminderMessage ? `https://wa.me/${waNumber}?text=${encodedReminder}` : undefined;
  const smsReminderHref =
    smsPhone && reminderMessage
      ? `sms:${smsPhone}${encodedReminder ? `?body=${encodedReminder}` : ''}`
      : undefined;

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
            {settings.propertyName} · {room?.name || settings.location}
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
          <div className="space-y-2 pt-2">
            {/* Call & plain SMS row */}
            <div className="grid grid-cols-2 gap-3">
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

            {/* Rent reminder row — shown only when there are overdue charges */}
            {overdueCharges.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {whatsAppReminderHref ? (
                  <a
                    href={whatsAppReminderHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 transition-colors"
                    title="Open WhatsApp with pre-filled rent reminder"
                  >
                    {/* WhatsApp icon via inline SVG (no extra dependency) */}
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    <span>WhatsApp</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-400 cursor-not-allowed"
                    title={phoneValid ? 'Phone number invalid' : 'No phone number'}
                  >
                    <MessageSquare size={14} />
                    <span>WhatsApp</span>
                  </button>
                )}

                {smsReminderHref ? (
                  <a
                    href={smsReminderHref}
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-800 transition-colors"
                    title="Open SMS with pre-filled rent reminder"
                  >
                    <MessageSquare size={14} className="shrink-0" />
                    <span>SMS Reminder</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-400 cursor-not-allowed"
                    title="No valid phone number"
                  >
                    <MessageSquare size={14} />
                    <span>SMS Reminder</span>
                  </button>
                )}
              </div>
            )}

            {/* No overdue charges info */}
            {overdueCharges.length === 0 && isActive && (
              <p className="text-[11px] text-gray-400 text-center pt-1">
                No outstanding rent — reminder actions are disabled.
              </p>
            )}
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
            {isActive ? `${formatMonthYear(selectedMonth)} balance` : 'Outstanding historical balance'}
          </span>
          <Badge variant={isOverdue ? 'overdue' : charge && balance > 0 ? 'neutral' : charge ? 'paid' : 'neutral'}>
            {isOverdue ? 'Overdue' : charge && balance > 0 ? 'Due soon' : charge ? 'Paid' : ('No charges for ' + formatMonthShort(selectedMonth))}
          </Badge>
        </div>

        <div>
          <div className="text-3xl font-bold text-gray-900 tracking-tight">{formatKSh(balance)}</div>
          {isOverdue && (
            <div className="text-xs text-amber-text font-medium mt-1">
              Due {charge?.dueDate ? formatDateShort(charge.dueDate) : `${settings.defaultDueDay || 5} ${formatMonthShort(selectedMonth)}`} · Outstanding on this tenancy
            </div>
          )}
          {!charge && (
            <div className="text-xs text-gray-500 font-medium mt-1">
              Clean ledger. No rent charge generated yet for {formatMonthYear(selectedMonth)}.
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
              <span className="text-gray-500">Tenancy status</span>
              <span className="font-semibold text-gray-900 capitalize">{tenancy.status}</span>
            </div>
          </div>

          {/* Security Deposit Management Card */}
          {(() => {
            const dep = deposits.find((d) => String(d.tenancyId) === String(tenancy.id));
            if (!dep) return null;

            const isWaived = dep.isWaived || dep.status === 'waived';
            const outstanding = dep.outstandingBalance ?? Math.max(0, (dep.requiredAmount || 0) - (dep.totalPaid ?? dep.amount ?? 0));
            const totalPaid = dep.totalPaid ?? dep.amount ?? 0;
            const required = dep.requiredAmount || (isWaived ? 0 : totalPaid);

            return (
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs uppercase tracking-wider text-gray-700">Security Deposit</div>
                  <Badge variant={
                    dep.status === 'held' ? 'paid' :
                    dep.status === 'partially_paid' || dep.status === 'unpaid' ? 'overdue' : 'neutral'
                  }>
                    {dep.status === 'partially_paid' ? 'Partially Paid' :
                     dep.status === 'unpaid' ? 'Unpaid' :
                     dep.status === 'waived' ? 'Waived' :
                     dep.status === 'held' ? 'Held' :
                     dep.status === 'settled' ? 'Settled' :
                     dep.status === 'refunded' ? 'Refunded' : dep.status}
                  </Badge>
                </div>

                {isWaived ? (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                    <div className="font-semibold">Deposit Requirement Waived</div>
                    <div className="text-[11px] text-amber-800">
                      Reason: {dep.waivedReason || 'Authorized exemption'}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200/70 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Deposit Required</span>
                      <span className="font-semibold text-gray-900">{formatKSh(required)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total Paid / Held</span>
                      <span className="font-semibold text-brand-700">{formatKSh(totalPaid)}</span>
                    </div>
                    <div className="flex justify-between text-gray-700 pt-1.5 border-t border-gray-200">
                      <span className="font-medium">Outstanding Balance</span>
                      <span className={`font-bold ${outstanding > 0 ? 'text-amber-700' : 'text-brand-700'}`}>
                        {formatKSh(outstanding)}
                      </span>
                    </div>

                    {outstanding > 0 && tenancy.status === 'active' && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setIsDepositModalOpen(true)}
                          className="w-full py-2 px-3 rounded-lg bg-brand-700 hover:bg-[#0D3F34] text-white text-xs font-semibold shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus size={14} />
                          <span>Record Deposit Payment</span>
                        </button>
                      </div>
                    )}

                    {/* Deposit payment installments history */}
                    {dep.payments && dep.payments.length > 0 && (
                      <div className="pt-2 border-t border-gray-200/60 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Payment Installments ({dep.payments.length})
                        </div>
                        {dep.payments.map((p, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px] py-1 border-b border-gray-200/50 last:border-b-0">
                            <div>
                              <span className="font-medium text-gray-900">{formatDateShort(p.paymentDate)}</span>
                              <span className="text-gray-400 ml-1.5 capitalize">({p.method}{p.reference ? ` · ${p.reference}` : ''})</span>
                            </div>
                            <span className="font-semibold text-brand-700">{formatKSh(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {dep.status !== 'held' && dep.status !== 'partially_paid' && dep.status !== 'unpaid' && dep.status !== 'waived' && (
                  <div className="text-xs divide-y divide-gray-100 pt-1">
                    {dep.rentDeducted > 0 && (
                      <div className="flex justify-between py-1.5 text-amber-800">
                        <span>Rent arrears deducted</span>
                        <span className="font-semibold">- {formatKSh(dep.rentDeducted)}</span>
                      </div>
                    )}
                    {dep.repairsDeducted > 0 && (
                      <div className="flex justify-between py-1.5 text-amber-800">
                        <span>Repairs deducted</span>
                        <span className="font-semibold">- {formatKSh(dep.repairsDeducted)}</span>
                      </div>
                    )}
                    {dep.refundAmount > 0 && (
                      <div className="flex justify-between py-1.5 text-brand-700">
                        <span>Refund disbursed</span>
                        <span className="font-bold">{formatKSh(dep.refundAmount)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

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

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-xs">
          <div className="text-gray-500">Payments received <strong className="block pt-1 text-gray-900">{formatKSh(receivedTotal)}</strong></div>
          <div className="text-gray-500">Rent allocated <strong className="block pt-1 text-gray-900">{formatKSh(allocatedTotal)}</strong></div>
          <div className="text-gray-500">Available advance <strong className="block pt-1 text-brand-700">{formatKSh(availableAdvance)}</strong></div>
          <div className="text-gray-500">Reserved future rent <strong className="block pt-1 text-gray-900">{formatKSh(reservedFuture)}</strong></div>
          <div className="text-gray-500">Refunded <strong className="block pt-1 text-gray-900">{formatKSh(refundsTotal)}</strong></div>
          <div className="text-gray-500">Reversed receipts <strong className="block pt-1 text-gray-900">{formatKSh(reversedTotal)}</strong></div>
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
                  <span className="text-gray-400">Rent periods covered</span>
                  <span className="text-right font-semibold text-gray-900">
                    {(p.allocations || []).length
                      ? (p.allocations || []).map((allocation) => allocation.chargeMonth + ': ' + formatKSh(Number(allocation.amount))).join(', ')
                      : 'No rent charge applied'}
                  </span>
                </div>
                {(p.reservations || []).filter((reservation) => reservation.status === 'reserved').map((reservation) => (
                  <div key={reservation.id} className="flex justify-between">
                    <span className="text-gray-400">Reserved for {reservation.month}</span>
                    <span className="font-semibold text-gray-900">{formatKSh(Number(reservation.remainingAmount))}</span>
                  </div>
                ))}
                {p.availableCredit !== undefined && p.availableCredit > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Unallocated advance</span>
                    <span className="font-semibold text-brand-700">{formatKSh(p.availableCredit)}</span>
                  </div>
                )}
                {(p.refunds || []).map((refund) => (
                  <div key={refund.id} className="flex justify-between">
                    <span className="text-gray-400">Refund · {formatDateShort(refund.date)}</span>
                    <span className="font-semibold text-gray-900">{formatKSh(Number(refund.amount))}</span>
                  </div>
                ))}
                {p.isReversed && <div className="text-xs font-semibold text-red-700">Payment reversed; original receipt retained.</div>}
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

      {/* Record Deposit Payment Modal */}
      {isActive && tenancy && tenant && room && (() => {
        const dep = deposits.find((d) => String(d.tenancyId) === String(tenancy.id));
        if (!dep) return null;
        return (
          <RecordDepositPaymentModal
            isOpen={isDepositModalOpen}
            onClose={() => setIsDepositModalOpen(false)}
            deposit={dep}
            tenantName={tenant.fullName}
            roomName={room.name}
          />
        );
      })()}
    </div>
  );
};
