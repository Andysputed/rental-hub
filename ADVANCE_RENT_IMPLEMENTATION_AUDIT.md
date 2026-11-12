# Advance rent and hybrid allocation: Phase 1 audit

## Existing ledger

- `Tenancy.start_date` is the recorded occupancy start (`DateField`). A monthly `RentCharge` belongs to one tenancy and records `month` (billing period), `due_date`, insertion time, amount and denormalized `paid_amount`.
- `Payment` records the receipt date and entry time and links to tenant, tenancy, room and a primary charge. `PaymentAllocation` separately links a payment to a rent charge, with an insertion timestamp. Payment and charge dates are not the allocation date.
- `generate_monthly_charges()` currently excludes a tenancy when its start is after the requested period end and excludes periods after its end. It charges the full monthly rent for any overlapping month; there is no first-month proration.
- The payment API has no move-in-date eligibility check. With no explicit charge, it prefers a charge matching `paymentDate` month, then older unpaid charges, and creates a charge in the payment month if none exists. With an explicit charge, it checks tenancy equality but not period eligibility. Excess funds are rejected instead of retained as credit.
- Charge generation and payment creation use transactions and row locks; monthly charges are unique per tenancy/month and payment references are unique. No existing model represents future reservations, unallocated credit, refunds or payment reversals.
- Tenant details selects an active tenancy (or latest tenancy) and filters its displayed rent/payment data by `tenancyId`. It displays receipt date, not entry/allocation timestamp; current payment records do not include allocation detail in the list UI.

## Historical records: do not alter

The six November 1, 2026 tenancies with October 2026 charges and their payment rows are preserved as-is and used only as reference/regression cases. The configured database was queried read-only. No updates, migrations or other writes were made to it. Current read-only checks found no cross-tenancy payment allocations, no payment tenant/tenancy mismatch, and no charge room/tenancy mismatch.

Five October charges were inserted within milliseconds of a payment record on the same tenancy, which is consistent with the payment endpoint auto-creating the payment-date month charge. The sixth October charge was created before its associated payment row was entered; its origin cannot be established from the available ledger fields. Existing data cannot prove whether those receipts were advances, late entries, or incorrect period assignments.

## Proposed schema

1. Add a `FutureRentReservation` model: payment, tenancy, target `YYYY-MM` period, original reserved amount, applied amount, released amount, status, related charge, timestamps and optional cancellation/release reason. Add uniqueness for one reservation per payment/tenancy/month and non-negative/amount consistency checks.
2. Add `PaymentRefund`, a separate cash-out event linked to the original payment, with amount, actual refund date, method/reference, actor, reason and creation time. Bound total refunds by available, unallocated credit.
3. Add a one-time `PaymentReversal` for a full payment void, linked to the original payment with reason, actor/time, plus child reversal amounts linked to the original allocations/reservations. Keep source payments, allocations and reservations immutable; reversal child rows identify the amount reversed and charge balances are recalculated atomically.
4. Do not add a mutable `advance_balance` field. Derive available advance from receipt amounts minus unreversed allocations, active reservation remainder, refunds and reversal amounts. Keep security deposits in their existing separate ledger.

## Proposed API and accounting behavior

- Preserve `POST /api/v1/payments/` with default automatic allocation. Add an explicit `allocationMode` and manual allocation/reservation entries to its request; keep old request fields backward compatible.
- Automatic mode: allocate oldest eligible existing rent charges chronologically; retain any remainder as unreserved advance credit. Do not create a rent charge just because a receipt date precedes move-in or the rent period is in the future.
- Manual mode: allocate explicit amounts to eligible existing charges, or create reservations for selected future periods with no charge yet. Validate tenancy ownership, amount limits, existing allocations/reservations, duplicate submissions and period eligibility.
- Rent generation: charge the full monthly rent for any tenancy that overlaps the period. Within the same transaction, lock and apply reservations for the new period once, creating normal `PaymentAllocation` rows; release any excess reservation to available credit. A retry must be idempotent.
- Move-out summary: report outstanding rent, available credit and reserved credit separately. Do not auto-refund or transfer funds. Refund/transfer requires an explicit authorized event and audit trail.
- Report cash receipts on actual payment date; report refunds separately as cash outflow. Charge generation/application of advance is not a second receipt. Receipts retain actual receipt date and show allocation/reservation breakdown.
- Frontend: default to automatic mode; allow manual periods, future reservation, preview of allocated/reserved/available amounts, and tenancy-specific history of receipts, allocations, reservations, refunds and reversals.

## Compatibility and migration risks

- New tables and nullable/defaulted fields are additive. No data migration or rewrite of existing payments/charges is required. Do not auto-correct the six historical cases.
- Existing payment API requests remain automatic mode. Their former overpayment rejection changes to retained credit; this is an intentional accounting behavior change and must be covered by regression tests.
- Existing payment references and receipt numbers remain unchanged. New events refer to existing payment IDs.
- The denormalized `RentCharge.paid_amount` must remain reconciled to live allocations less reversal allocations plus any existing deposit rent deductions. A service must update it within the same transaction as allocation/reversal; add reconciliation tests.
- PostgreSQL row locks must be taken in consistent order (tenancy, charges by month/id, payment, reservations by month/id) and duplicate payment/reversal/refund requests must be database constrained or idempotent.
- Migrations will be generated and exercised on isolated test databases only. The configured database and its historical records will not be migrated as part of this implementation.

## Phase 1 classification

- **Confirmed defect:** payment creation lacks a move-in/period guard and can auto-create a charge for the payment-date month; allocation can target any charge in the same tenancy regardless of period.
- **Confirmed history display behavior:** the UI uses exact tenancy IDs, so previous-occupant ledgers are not mixed into a different tenancy's history.
- **Suspicious historical records:** six November 1 tenancies have fully paid October charges; the business meaning of their receipts is unverified. Keep unchanged.
- **Not assumed invalid:** a payment date before move-in may be a legitimate advance, and a later payment may settle an earlier documented debt. The new model makes advance/period intent explicit rather than rejecting solely based on date ordering.
