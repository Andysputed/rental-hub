import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, ChevronRight, Phone, Mail, LogOut, Search } from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { Badge } from '../components/common/Badge';
import { MoveOutModal } from '../components/common/MoveOutModal';
import { formatKSh } from '../utils/format';

export const TenantsPage: React.FC = () => {
  const navigate = useNavigate();
  const { tenants, rooms, tenancies, rentCharges, settings, moveOutTenant } = useRental();

  const [filter, setFilter] = useState<'all' | 'active' | 'former'>('all');
  const [search, setSearch] = useState('');
  const [moveOutTarget, setMoveOutTarget] = useState<{
    id: string;
    roomId: string;
    tenantName: string;
    roomName: string;
    startDate: string;
  } | null>(null);

  // Active tenancies map
  const activeTenanciesMap = new Map<string, typeof tenancies[0]>();
  tenancies.forEach((t) => {
    if (t.status === 'active') {
      activeTenanciesMap.set(String(t.tenantId), t);
    }
  });

  const activeCount = tenants.filter((t) => activeTenanciesMap.has(String(t.id))).length;
  const formerCount = tenants.length - activeCount;

  const filteredTenants = tenants.filter((tenant) => {
    const hasActive = activeTenanciesMap.has(String(tenant.id));

    if (filter === 'active' && !hasActive) return false;
    if (filter === 'former' && hasActive) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = tenant.fullName.toLowerCase().includes(q);
      const matchPhone = tenant.phone.toLowerCase().includes(q);
      const matchEmail = tenant.email ? tenant.email.toLowerCase().includes(q) : false;
      return matchName || matchPhone || matchEmail;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">Directory and tenancies at {settings.propertyName}</p>
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

      {/* Filter Tabs and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <div className="inline-flex p-1 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 self-start">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              filter === 'all' ? 'bg-white text-gray-900 shadow-2xs' : 'hover:text-gray-900'
            }`}
          >
            All tenants ({tenants.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              filter === 'active' ? 'bg-white text-gray-900 shadow-2xs' : 'hover:text-gray-900'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('former')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              filter === 'former' ? 'bg-white text-gray-900 shadow-2xs' : 'hover:text-gray-900'
            }`}
          >
            Former ({formerCount})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredTenants.length === 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-gray-900">No tenants found</p>
          <p className="text-xs text-gray-500">
            {search ? `No records matching "${search}"` : 'No tenants match the current filter.'}
          </p>
        </div>
      )}

      {/* Tenants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTenants.map((tenant) => {
          const activeTenancy = tenancies.find(
            (t) => String(t.tenantId) === String(tenant.id) && t.status === 'active'
          );
          const historicalTenancy = tenancies.find(
            (t) => String(t.tenantId) === String(tenant.id)
          );
          const tenancy = activeTenancy || historicalTenancy;
          const room = rooms.find((r) => String(r.id) === String(tenancy?.roomId));
          const charge = tenancy
            ? rentCharges.find((c) => String(c.tenancyId) === String(tenancy.id) && c.month === '2026-10')
            : undefined;
          const balance = charge ? charge.amount - charge.paidAmount : 0;
          const isActive = !!activeTenancy;

          return (
            <div
              key={tenant.id}
              onClick={() => navigate(`/tenants/${tenant.id}`)}
              className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs hover:border-gray-300 transition-all cursor-pointer space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EBF5F0] text-brand-700 font-bold text-sm flex items-center justify-center">
                      {tenant.initials}
                    </div>
                    <div>
                      <div className="text-base font-bold text-gray-900">{tenant.fullName}</div>
                      <div className="text-xs text-gray-500">
                        {isActive ? room?.name || 'Assigned' : `Former · ${room?.name || 'Unassigned'} (Ended)`}
                      </div>
                    </div>
                  </div>
                  {isActive ? (
                    <Badge variant={balance > 0 ? 'overdue' : 'paid'}>
                      {balance > 0 ? `Overdue ${formatKSh(balance)}` : 'Paid'}
                    </Badge>
                  ) : (
                    <Badge variant={balance > 0 ? 'overdue' : 'former'}>
                      {balance > 0 ? `Arrears ${formatKSh(balance)}` : 'Former tenant'}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-gray-600 mt-4 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-gray-400" />
                    <span>{tenant.phone}</span>
                  </div>
                  {tenant.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <span>{tenant.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-3 border-t border-gray-100">
                <span className="font-semibold text-gray-600">
                  {isActive
                    ? `Rent: ${formatKSh(activeTenancy?.monthlyRent || 10000)} / mo`
                    : 'Tenancy ended'}
                </span>

                <div className="flex items-center gap-2">
                  {isActive && activeTenancy && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoveOutTarget({
                          id: String(activeTenancy.id),
                          roomId: String(activeTenancy.roomId),
                          tenantName: tenant.fullName,
                          roomName: room?.name || 'Room',
                          startDate: activeTenancy.startDate,
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs transition-colors cursor-pointer"
                    >
                      <LogOut size={13} />
                      <span>Move Out</span>
                    </button>
                  )}

                  <div className="flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                    <span>Details</span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
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
