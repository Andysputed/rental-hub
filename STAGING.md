# RentalHub Staging Environment

A completely isolated, reproducible staging stack for end-to-end testing. It never
points at the production Neon database and never touches production credentials.

## Architecture

| Piece | Value |
| :--- | :--- |
| Database engine | PostgreSQL 16 (local cluster) |
| Cluster data directory | `%USERPROFILE%\RentalHubStaging\pgdata` |
| Host / port | `127.0.0.1:55432` (loopback only) |
| Database | `rentalhub_staging` (test runs use `test_rentalhub_staging`) |
| Database user | `staging_admin` (trust auth, local cluster) |
| Django settings | `config.staging_settings` |
| Backend | `http://127.0.0.1:8000` |
| Frontend | `http://localhost:5173` (dev server) |

Production remains Vercel (SPA) + Render (`config.settings`) + Neon. Nothing in this
document changes production configuration.

## Isolation guards

- `backend/config/staging_settings.py`
  - Loads `backend/.env.staging` only.
  - Refuses to start if `DATABASE_URL` is set (prevents inheriting a hosted URL).
  - Requires the exact database name `rentalhub_staging`, host `127.0.0.1` and port
    `55432`; otherwise `ImproperlyConfigured` is raised.
  - Sets `RENTALHUB_STAGING = True`.
- `backend/config/staging_guard.py` (`assert_staging`) is called by the destructive
  management commands. It re-checks the settings flag, database name, loopback host
  and port, and rejects `neon.tech` / `render.com` hostnames before deleting anything.
- `scripts/staging-db.sh` only drives the dedicated cluster directory and loopback
  port; it never reads `.env` or production settings.

Verified failures during this build:

- `DJANGO_ENV=staging` with `DATABASE_URL` set → `ImproperlyConfigured`.
- Staging settings with a non-loopback host or a different database name →
  `ImproperlyConfigured`.
- `reset_staging_data` under staging settings → proceeds; under any other settings →
  `CommandError` from `assert_staging`.

## First-time setup

Prerequisites: PostgreSQL 16 installed (default `C:\Program Files\PostgreSQL\16\bin`),
Python virtualenv at `backend/.venv`.

```bash
cp backend/.env.staging.example backend/.env.staging   # optional; the script does it
bash scripts/staging-db.sh bootstrap
```

`bootstrap` initializes the cluster, starts it, creates the database, applies
migrations, and seeds + verifies the fictional dataset.

## Daily commands

```bash
bash scripts/staging-db.sh init       # create cluster/data dir if missing
bash scripts/staging-db.sh start      # start cluster, ensure database exists
bash scripts/staging-db.sh stop       # stop cluster
bash scripts/staging-db.sh status     # show database, port, user, data directory
bash scripts/staging-db.sh migrate    # apply migrations to staging
bash scripts/staging-db.sh seed       # wipe + regenerate the fictional dataset
bash scripts/staging-db.sh reset      # delete staging data (guarded, asks for confirmation)
bash scripts/staging-db.sh verify     # run financial integrity checks
bash scripts/staging-db.sh test       # run the Django test suite on the staging cluster
bash scripts/staging-db.sh shell      # Django shell using staging settings
```

Run the app against staging:

```bash
cd backend
DJANGO_SETTINGS_MODULE=config.staging_settings .venv/Scripts/python.exe manage.py runserver 127.0.0.1:8000 --noreload
```

```bash
cd rental-hub
npm run dev
```

Staging landlord login (fictional, staging-only):

- Username: `staging_landlord`
- Password: value of `STAGING_LANDLORD_PASSWORD` in `backend/.env.staging`
  (example file ships `StagingLandlord!2026`)

## Fictional dataset

Everything is generated through the existing production services
(`TenantRegistrationSerializer`, `generate_monthly_charges`,
`RecordPaymentSerializer`, `record_deposit_payment`), so no parallel financial rules
exist.

- Property: Ridgeview Staging Apartments, Stagingville, Nairobi.
- Rooms: 6 (`01`–`06`), distinct default rents 10,000–14,500; Room 06 vacant.
- Tenants/tenancies: 5 fictional tenants with different move-in dates
  (2026-07-01 … 2026-11-01), agreed rents, and due days.
- Charges: 15 monthly charges from 2026-07 to 2026-11, total **183,366.67**,
  including a prorated move-in charge (Cynthia, 2026-09-15, 5,866.67).
- Payments: 14 receipts, total **143,366.67**, across M-Pesa, Cash and Bank,
  with full, partial and late payments. Allocated **142,366.67**; **1,000.00**
  remains as advance credit.
- Outstanding rent: **41,000.00**.
- Deposits: 5 obligations totalling **63,500.00**; **45,000.00** held;
  **18,500.00** outstanding. Deposits never appear in rent receipts.
- Expenses: 6 entries totalling **25,650.00** across maintenance, utilities and
  cleaning.

`verify_staging_data` asserts all of the above, plus:

- no duplicate tenancy-month charges and idempotent regeneration (creates 0),
- historical charge amounts unchanged after regeneration,
- charge `paid_amount` reconciles with active allocations,
- sequential receipts `RH-2026-001` … `RH-2026-014`,
- monthly reports reconcile for 2026-07, 2026-10 and 2026-11,
- dashboard occupancy and outstanding totals match the ledger.

## Resetting

```bash
bash scripts/staging-db.sh seed     # canonical reset; safe and repeatable
bash scripts/staging-db.sh reset    # same wipe, interactive confirmation
```

Both commands call `assert_staging`. They cannot run against production settings and
only touch `rentalhub_staging` on `127.0.0.1:55432`. Auth users are preserved so the
staging login keeps working.

## Tests

```bash
bash scripts/staging-db.sh test
```

Result on this build: **134 tests passed, 7 skipped** (356 s) against the staging
PostgreSQL cluster.

## Known issues found during staging E2E

These are observation notes, not staging-only artifacts:

1. Prorated kobo/cents amounts (e.g. 5,866.67) cannot be typed exactly into payment
   and move-out settlement inputs because the numeric inputs default to `step=1`;
   the browser rejects the value ("nearest valid values are 4333 and 4334").
2. The dashboard headline "rent received" sums charge `paid_amount` rather than cash
   receipts, so unallocated advance credit is omitted.
3. The record-payment screen inherits the currently selected month in the top bar.
   If that month lies outside the tenancy, submission fails with
   "chargeMonth: Selected rent period is outside this tenancy" and there is no month
   control on the form.
4. The payment allocation preview labels the target charge with the selected month
   instead of the charge's actual month, and does not cap "unallocated advance
   credit" at the post-allocation value when the amount exceeds the balance.
5. Whole-shilling display rounding hides small cent balances (e.g. 0.33).
6. Move-out review renders the raw method value "Mpesa" instead of "M-Pesa".
7. The login screen shows a hard-coded "Kimumu Rentals" brand while the seeded
   property and dashboard show "Ridgeview Staging Apartments".
