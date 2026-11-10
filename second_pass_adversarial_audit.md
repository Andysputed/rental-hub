# RentalHub second-pass adversarial audit

Date: 2026-11-09

## Scope and safety

- Reviewed DEF-01 through DEF-08 in the current Django code, migrations, and tests.
- Ran the full backend suite on `config.test_settings`, which forces SQLite and an in-memory Django test database. Production migrations were applied only after the user explicitly authorized it; no tests were run against the configured PostgreSQL database.
- Queried PostgreSQL only inside explicit read-only transactions. No live records were changed and no production migration was applied.
- Read-only field fingerprints for Tenant, Tenancy, RentCharge, Payment, PaymentAllocation, Deposit, DepositDeduction, and Expense matched before and after verification. Counts also remained 11, 11, 17, 14, 14, 11, 1, and 4 respectively.

## Findings and changes

| Area | Review result and remediation |
| --- | --- |
| Payment allocation | The endpoint locks the room and tenancy, then all candidate charges, and allocates the received amount completely across the primary charge and later unpaid charges. Overpayment is rejected. A failure injected on the second allocation rolled back the payment, first allocation, receipt counter, and all charge changes. Decimal-cent allocation was tested. |
| Payment month and advance rent | A supplied `chargeId` is applied first, then spills over oldest outstanding charges. Without `chargeId`, the payment-date month charge is preferred; when absent, the oldest outstanding charge is selected, and a new charge for the payment month is created if none exists. Thus advance payments are currently accepted by creating a future-month charge. This behavior is documented here and was not changed. |
| Payment corrections | Payment update and delete routes are no longer exposed, preventing silent edits and cascading deletion of allocation history. There is no compensating reversal/correction workflow yet; corrections must be handled outside the API until an auditable reversal ledger exists. |
| Receipt sequence | Added a yearly `ReceiptSequence` row locked with `select_for_update`, while keeping the receipt-number unique constraint. The counter increments inside the same transaction as payment and allocations, initializes from the maximum numeric historical suffix, and resets by year. Tests cover four-digit rollover and year changes. Concurrency was not genuinely exercised against PostgreSQL. |
| Duplicate references | Database uniqueness remains authoritative; a concurrent duplicate insert is caught outside the failed transaction and returned as HTTP 400. Sequential duplicate validation remains in place. |
| Tenancy | Added a partial unique constraint for one active tenancy per tenant, complementing the existing one-active-tenancy-per-room constraint. Registration rechecks under its transaction and maps constraint races to a validation error. Move-out locks room before tenancy, rechecks ended status after acquiring locks, then updates tenancy/tenant/room atomically. |
| Lock order | Payment, move-out, and deposit settlement use room → tenancy lock ordering to avoid the prior room/tenancy inversion. Deposit is locked after those shared rows. Rent generation uses the unique tenancy/month key with `get_or_create` inside its transaction. |
| Financial constraints | Added database checks for positive payment/allocation/deposit/deduction/expense/rent/room amounts, nonnegative tenancy deposits and charge paid amounts, and due days from 1 through 28. Read-only prechecks found no current violations for these constraints. No constraint was added for `paid_amount <= amount`, because one historical charge is already overpaid and must remain untouched. |
| Deposit settlement | Validation is repeated after locks against current arrears and held deposit. Deductions plus refund must reconcile to the full deposit; any retained amount must be recorded as a deduction. Injected deduction failure rolled back deduction, charge, deposit, and tenancy changes. |
| Reporting | Dashboard and monthly report cash income now sum actual `Payment.amount` by payment date. Deposit deductions still reduce charge arrears but no longer appear as cash collected. A regression test covers that distinction. |
| DEF-03/04/05/08 | Application validation remains in place; database checks now backstop due-day, room-rent, expense, and related amount invariants. Existing frontend submit guards remain unchanged. |

## Test results

- `makemigrations --check --dry-run`: no model/migration drift.
- Initial full suite: **84 tests passed** on isolated in-memory SQLite. The final expanded suite after the production-readiness work ran **87 tests, 0 failures, 7 PostgreSQL-only skips**; an additional sub-cent precision regression passed separately.
- After authorization, all seven pending additive migrations applied successfully to PostgreSQL. `showmigrations` confirms all are applied, and direct PostgreSQL introspection confirms the expected constraints exist.
- Post-migration read-only fingerprints match the pre-migration values for all eight audited record types; row counts are unchanged. The existing overpaid charge remains unchanged.
- System checks: no issues.
- Failure injection covered payment insertion, midway multi-charge allocation, tenant registration after tenancy/room updates, move-out after tenancy update, rent generation after charge insertion, deposit settlement during deduction creation, and expense insertion. Each operation left no partial database state.
- The first pass did not run genuine PostgreSQL concurrency tests. The subsequent production-readiness pass ran seven two-worker PostgreSQL race scenarios on the isolated database `test_rentalhub_audit_test_20261109_7d914a3f`; all seven passed and Django destroyed the test database afterward. Scenarios cover payment over-allocation, duplicate transaction references, receipt sequence collisions across rooms, concurrent duplicate-tenant and duplicate-room registrations, duplicate deposit refunds, and rent generation.

## Live read-only integrity results

- Payments: all 14 payment amounts matched their allocation totals.
- Charges: all 17 `paid_amount` values matched payment allocations plus rent deposit deductions.
- Deposits: all 11 summary deduction fields matched their deduction rows.
- Active tenant duplicates: none. Active room duplicates: none.
- One historical overpaid charge remains: charge ID 4 has amount 10,000.00 and paid amount 14,000.00. It was not edited. Its ledger allocations reconcile to the stored paid amount, but it exceeds the charge face value; the new allocator prevents creating further over-allocation through the payment endpoint.
- Field-level fingerprints for the financial and tenancy records listed above were identical before and after the audit, confirming no live historical fields changed.

## Remaining limitations

1. Run genuine concurrency tests for move-out racing a room re-registration, API retry behavior under network interruption, and any hosting proxy/database failover conditions; the tested PostgreSQL races do not cover every interleaving.
2. Build an audited payment reversal/correction workflow using compensating records rather than edits/deletes.
3. Investigate charge 4’s existing 4,000.00 excess through a separately approved accounting correction. No historical financial record was changed as part of this pass.
4. The named first-pass artifact `edge_case_audit_and_remediation_plan.md` was not present in the workspace, so this report records the second-pass results independently.
