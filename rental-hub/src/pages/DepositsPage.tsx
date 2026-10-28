import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronUp,
  LogOut,
} from 'lucide-react';
import { useRental } from '../context/RentalContext';
import { Badge } from '../components/common/Badge';
import { MoveOutModal } from '../components/common/MoveOutModal';
import { formatKSh, formatDateShort } from '../utils/format';
import type { Deposit, DepositStatus } from '../types';

export const DepositsPage: React.FC = () => {
  const { deposits, tenancies, rooms, settings, refreshData } = useRental();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedDepositId, setExpandedDepositId] = useState<string | null>(null);
  const [settleTargetTenancy, setSettleTargetTenancy] = useState<{
    id: string;
    roomId: string;
    tenantName: string;
    roomName: string;
    startDate: string;
    deposit?: number;
  } | null>(null);

  // Compute summary metrics across all deposits
  const totalHeld = useMemo(() => {
    return deposits
      .filter((d) => d.status === 'held')
      .reduce((sum, d) => sum + d.amount, 0);
  }, [deposits]);

  const totalRefunded = useMemo(() => {
    return deposits.reduce((sum, d) => sum + (d.refundAmount || 0), 0);
  }, [deposits]);

  const totalDeductionsApplied = useMemo(() => {
    return deposits.reduce((sum, d) => sum + (d.totalDeductions || (d.rentDeducted + d.repairsDeducted) || 0), 0);
  }, [deposits]);

  const activeHeldCount = useMemo(() => {
    return deposits.filter((d) => d.status === 'held').length;
  }, [deposits]);

  // Filtered deposits list
  const filteredDeposits = useMemo(() => {
    return deposits.filter((deposit) => {
      // Status filter
      if (statusFilter !== 'all' && deposit.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const tenantMatches = (deposit.tenantName || '').toLowerCase().includes(query);
        const roomMatches = (deposit.roomName || '').toLowerCase().includes(query);
        const refMatches = (deposit.reference || '').toLowerCase().includes(query);
        const refundRefMatches = (deposit.refundReference || '').toLowerCase().includes(query);
        if (!tenantMatches && !roomMatches && !refMatches && !refundRefMatches) {
          return false;
        }
      }

      return true;
    });
  }, [deposits, statusFilter, searchTerm]);

  const toggleExpand = (id: string) => {
    setExpandedDepositId((prev) => (prev === id ? null : id));
  };

  const handleOpenSettle = (deposit: Deposit) => {
    const tenancy = tenancies.find((t) => String(t.id) === String(deposit.tenancyId));
    const room = rooms.find((r) => String(r.id) === String(deposit.roomId || tenancy?.roomId));

    setSettleTargetTenancy({
      id: deposit.tenancyId,
      roomId: deposit.roomId || tenancy?.roomId || '',
      tenantName: deposit.tenantName,
      roomName: deposit.roomName || room?.name || 'Room',
      startDate: tenancy?.startDate || deposit.receivedDate,
      deposit: deposit.amount,
    });
  };

  const getStatusBadge = (status: DepositStatus) => {
    switch (status) {
      case 'held':
        return <Badge variant="active">Held in Trust</Badge>;
      case 'settled':
        return <Badge variant="paid">Settled</Badge>;
      case 'refunded':
        return <Badge variant="neutral">Refunded in Full</Badge>;
      case 'applied':
        return <Badge variant="bank">Applied to Rent</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Security deposits</h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-brand-700 border border-emerald-200">
              <ShieldCheck size={13} />
              <span>Segregated Trust Ledger</span>
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {settings.propertyName} · Legally segregated from rent revenue and operational cash flow
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Held Deposits */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Deposits held</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            {formatKSh(totalHeld)}
          </div>
          <div className="text-[11px] text-gray-400">
            {activeHeldCount} active tenanc{activeHeldCount === 1 ? 'y' : 'ies'} held
          </div>
        </div>

        {/* Refunded */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-1">
          <span className="text-xs font-semibold text-gray-500">Refunded to tenants</span>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            {formatKSh(totalRefunded)}
          </div>
          <div className="text-[11px] text-gray-400">Total disbursed upon move-out</div>
        </div>

        {/* Total Deductions */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-1">
          <span className="text-xs font-semibold text-gray-500">Deductions applied</span>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            {formatKSh(totalDeductionsApplied)}
          </div>
          <div className="text-[11px] text-gray-400">Arrears & damage deductions</div>
        </div>

        {/* Total Records */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-1">
          <span className="text-xs font-semibold text-gray-500">Total ledger records</span>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            {deposits.length}
          </div>
          <div className="text-[11px] text-gray-400">Historical audit trail preserved</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by tenant, room, or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-gray-200 bg-gray-50/50 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'held', label: 'Held' },
              { id: 'settled', label: 'Settled' },
              { id: 'refunded', label: 'Refunded' },
              { id: 'applied', label: 'Applied' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-brand-700 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Deposits Records List */}
      <div className="space-y-3">
        {filteredDeposits.length === 0 ? (
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-10 text-center space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">No deposit records found</h3>
              <p className="text-xs text-gray-500 mt-1">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your search query or filter options.'
                  : 'Deposits recorded during tenant registration will appear here.'}
              </p>
            </div>
          </div>
        ) : (
          filteredDeposits.map((deposit) => {
            const isExpanded = expandedDepositId === deposit.id;
            const hasDeductions = deposit.deductions && deposit.deductions.length > 0;
            const isHeld = deposit.status === 'held';

            return (
              <div
                key={deposit.id}
                className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 transition-all hover:border-gray-300"
              >
                {/* Top Row: Tenant & Room & Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#EBF5F0] text-brand-700 font-bold text-sm flex items-center justify-center shrink-0">
                      {deposit.roomNumber || deposit.roomName?.replace(/\D/g, '') || '00'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{deposit.tenantName}</span>
                        <span className="text-xs font-semibold text-gray-500">· {deposit.roomName}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        Received {formatDateShort(deposit.receivedDate)} · Ref: {deposit.reference || 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {getStatusBadge(deposit.status)}
                    <span className="text-base font-extrabold text-gray-900 tracking-tight ml-2">
                      {formatKSh(deposit.amount)}
                    </span>
                  </div>
                </div>

                {/* Settlement Summary Pill if settled/refunded */}
                {!isHeld && (
                  <div className="p-3 bg-gray-50 border border-gray-200/80 rounded-xl text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3 text-gray-600">
                        {deposit.rentDeducted > 0 && (
                          <span>
                            Rent cleared: <strong className="text-amber-800">{formatKSh(deposit.rentDeducted)}</strong>
                          </span>
                        )}
                        {deposit.repairsDeducted > 0 && (
                          <span>
                            Repairs: <strong className="text-amber-800">{formatKSh(deposit.repairsDeducted)}</strong>
                          </span>
                        )}
                        {deposit.refundAmount > 0 && (
                          <span>
                            Refund: <strong className="text-brand-700">{formatKSh(deposit.refundAmount)}</strong>{' '}
                            <span className="text-gray-400 capitalize">({deposit.refundMethod || 'M-Pesa'})</span>
                          </span>
                        )}
                      </div>

                      {deposit.settledAt && (
                        <span className="text-[11px] text-gray-400">
                          Settled {formatDateShort(deposit.settledAt)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Action & Toggle Row */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                  <div>
                    {hasDeductions ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(deposit.id)}
                        className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline cursor-pointer"
                      >
                        <span>Audit deductions ({deposit.deductions.length})</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-[11px]">
                        {isHeld ? 'No deductions recorded yet' : 'Settled with full refund'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isHeld && (
                      <button
                        type="button"
                        onClick={() => handleOpenSettle(deposit)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs border border-amber-200 transition-colors cursor-pointer"
                      >
                        <LogOut size={13} />
                        <span>Move out & settle</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Audit Details */}
                {isExpanded && hasDeductions && (
                  <div className="pt-3 border-t border-gray-100 space-y-2 animate-in fade-in duration-150">
                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                      Itemized Deductions Ledger
                    </span>
                    <div className="divide-y divide-gray-100 bg-gray-50/70 border border-gray-200 rounded-xl overflow-hidden text-xs">
                      {deposit.deductions.map((ded, i) => (
                        <div key={ded.id || i} className="p-2.5 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-gray-900">{ded.description}</div>
                            <div className="text-[11px] text-gray-400 capitalize">
                              Category: {ded.deductionType} {ded.chargeMonth ? `· Month: ${ded.chargeMonth}` : ''}
                            </div>
                          </div>
                          <span className="font-bold text-amber-900">- {formatKSh(ded.amount)}</span>
                        </div>
                      ))}
                    </div>

                    {deposit.settlementNotes && (
                      <div className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">Settlement notes: </span>
                        {deposit.settlementNotes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Move Out & Settle Modal Dialog */}
      {settleTargetTenancy && (
        <MoveOutModal
          isOpen={!!settleTargetTenancy}
          onClose={() => setSettleTargetTenancy(null)}
          onSettled={async () => {
            await refreshData();
            setSettleTargetTenancy(null);
          }}
          tenancy={settleTargetTenancy}
        />
      )}
    </div>
  );
};
