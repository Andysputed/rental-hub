# RentalHub production readiness audit

Audit started: 2026-11-09  
Scope: current repository, configured runtime, and Acacia House PostgreSQL read-only checks. This is an initial audit; remediation and evidence will be appended after implementation.

## Current architecture

- React 19 + TypeScript + Vite 8 + Tailwind 4 SPA, static assets under `rental-hub/`.
- Django 5.1 + Django REST Framework API, WSGI/ASGI entry points under `backend/config/`.
- PostgreSQL configured through environment variables; local SQLite fallback. Current actual database is PostgreSQL.
- DRF token authentication, one landlord-oriented application, six rooms, KES decimal ledgers.
- No deployment manifests, CI workflow, production WSGI server, cache/queue, backup automation, observability integration, or hosting provider/domain configuration is present.
- Financial schema migrations from the second-pass audit are applied to PostgreSQL. No user data was reset or reseeded.

## Production-readiness matrix — initial findings

Severity: Critical / High / Medium / Low. Confirmed means directly observed in source or verified state. Potential means the final behavior depends on hosting/account configuration not available in this repository.

| Component | Current implementation | Risk / severity | Required correction | Verification |
| --- | --- | --- | --- | --- |
| Django environment | `DEBUG` defaults true; a fallback `SECRET_KEY` is accepted; host list defaults to localhost. | Confirmed / Critical | Separate dev and prod settings; require secrets/hosts in production and fail startup on unsafe values. | Production settings tests and `manage.py check --deploy`. |
| Framework support lifecycle | Installed Django is 5.1.15, and `requirements.txt` excludes Django 5.2+. The 5.1 branch is no longer supported as of this audit date. | Confirmed / High | Upgrade to supported Django 5.2 LTS patch line and test compatibility before release. | Current official Django supported-version table and full backend tests. |
| HTTPS/security headers | HSTS, SSL redirect, secure cookies and trusted-proxy policy are not configured. | Confirmed / High | Enable HTTPS security when production HTTPS is established; only trust an explicitly configured proxy. | Production security settings tests and deployment header inspection. |
| Authentication | DRF database tokens have no expiry/refresh policy. Login has no throttling. Password reset is absent. | Confirmed / High | Cookie session flow with CSRF protection, database-backed login throttling, password reset flow; optional MFA remains optional. | Auth lifecycle, CSRF, throttle, expiry, reset tests. |
| Browser token storage | Auth token is read/written in `localStorage`. | Confirmed / High | Remove bearer token from browser storage; use secure HttpOnly session cookies and explicit CSRF token handling. | Browser auth persistence, CSRF, logout, expiry tests. |
| API access control | Global default requires authentication, but tenant, payment, rent, expense and deposit querysets are not scoped to a property/account. | Confirmed / High if more than one property/account is introduced | Enforce a single configured property boundary or establish per-user ownership; remove arbitrary cross-property IDs. | Two-property isolation tests for list, detail, actions and writes. |
| API write surface | Generic ModelViewSets expose writes/deletes on financial/identity resources beyond explicit workflows. | Confirmed / High | Restrict endpoint methods to the documented workflow; make historical ledgers read-only and use auditable corrections. | API method/permission matrix tests. |
| Database side effects | Room/settings GET paths call `get_or_create_default_property()`, which can create the property, settings and rooms. | Confirmed / Medium | Keep read endpoints read-only; bootstrap data only through an explicit management/setup operation. | Assert GET endpoints do not change row counts. |
| Settings atomicity | Settings PATCH can return a 400 from inside `transaction.atomic()` after earlier writes; normal response return commits the transaction. | Confirmed / High | Validate the complete payload before writes; raise/rollback on invalid input. | Multi-field invalid-payload rollback test. |
| Payments and receipts | Payment writes use transactions and locked rows; receipt sequence is DB-backed and unique. Receipt view derives a single-charge balance despite spillover allocations. | Confirmed / Medium | Render all allocations and calculate receipt allocation figures from the payment's actual allocations. | Multi-charge receipt tests. |
| Historical discrepancy | Charge ID 4 is KSh 10,000 with KSh 14,000 paid, all tied to three actual payment allocations; it is marked paid with zero balance. No deposit deduction explains the excess. | Confirmed / High accounting exception | Preserve records; reconcile payment/receipt source and ask for explicit approval before a journal/correction. | Read-only reconciliation and approved accounting review. |
| Reporting | Cash receipts now sum Payment records by payment date; charge arrears include deposit rent deductions. | Confirmed / Medium | Preserve this separation; add regression and reconciliation coverage. | Dashboard/report tests. |
| PostgreSQL | Config supports host/user/password/port but no SSL mode, connection timeout, pool/connection lifetime, or read-only role validation. | Confirmed / High | Environment-driven connection security and timeouts; least-privilege runtime role. | Inspect effective connection TLS/role; run isolated PG tests. |
| Current DB role / transport | Read-only PostgreSQL inspection shows the configured application connection is using a superuser role and TLS is off. | Confirmed / Critical for internet-hosted production | Do not deploy these credentials; provision a restricted app role and TLS-enabled hosted database credentials, then verify effective role/TLS. | Read-only `pg_roles` and `pg_stat_ssl` checks after provider setup. |
| PostgreSQL concurrency | Existing tests ran against isolated SQLite; PostgreSQL `select_for_update`/uniqueness behavior has not been exercised concurrently. | Confirmed / High | Create a uniquely named isolated PG test database; run multithreaded payment, receipt and tenancy races. | Genuine concurrent PG tests and post-test integrity queries. |
| Backups / disaster recovery | No automation, encrypted backup target, retention, restore runbook, RPO/RTO, or restore evidence. | Confirmed / Critical | Configure after provider/storage is selected; perform a restore into a separate test database. | Dated restore record and application smoke checks. |
| Hosting/runtime | WSGI exists, but only the Django development server is documented; no Gunicorn/uWSGI dependency or production start command. | Confirmed / High | Add a production WSGI server and provider-neutral launch/config docs. | Launch process, health/readiness and static asset checks. |
| Static/media | No media feature currently identified. Django static collection/serving strategy is not configured. | Confirmed / Medium | Serve collected admin static assets through selected host or a minimal static middleware. | Production admin page asset test. |
| Frontend configuration | `.env.example` points at localhost; fallback API URL also points at localhost. | Confirmed / High | Require explicit production API URL at build time; reject localhost in production builds. | Production build config test and deployed browser request. |
| Frontend route/session | Protected routes validate the stored token on startup; session state survives reload. | Confirmed / Medium | Preserve refresh behavior while migrating auth to cookies. | Browser refresh and expired-session tests. |
| Frontend quality | TypeScript/Vite production build was reported as passing in the prior audit; no browser compatibility, accessibility, or visual regression suite is configured. | Partial / Medium | Run build and add focused keyboard/route/viewport checks. | Current build and browser checks at supported viewport sizes. |
| Dependency security | `npm audit --omit=dev` reports zero production vulnerabilities. Full npm audit reports 10 moderate advisories in development/lint tooling; Python audit is pending because `pip-audit` is not installed. | Confirmed / Medium | Update/reconcile lint tool versions and run Python dependency audit. | Full audit after lockfile update and Python advisory scan. |
| Pagination/performance | List APIs return unpaginated result sets. Current data volume is small; dashboard performs Python aggregation over charge rows. | Confirmed / Low now, grows with history | Add bounded pagination and aggregate only where useful for current scale. | Query counts and response-size checks. |
| Logging/monitoring | A few frontend `console.error` calls; no structured server logs, request IDs, health/readiness endpoints, alerting, or error-monitor integration. | Confirmed / High operational risk | Add safe structured logs, redaction, health/readiness and provider-neutral hooks. | Secret/PII redaction tests, health checks and log review. |
| CI/CD | No CI workflow or deployment gates exist. | Confirmed / High | Add backend/frontend checks, migrations check, security audit and deployment config validation. | CI run on a clean checkout. |
| Privacy/legal | Tenant names, phone, email and financial details are stored/displayed. No privacy notice, retention/export/incident process is documented. | Confirmed / High operational/legal risk | Minimise access, document retention/incident process, seek Kenyan privacy counsel review. | Access review and legal sign-off; do not self-certify compliance. |

## Second-pass verification and current release decision (2026-11-09)

This section supersedes stale initial-status statements above where they conflict.

### Implemented during this pass

- Added fail-closed production settings, session/CSRF authentication, throttling, password reset, health/readiness endpoints, request IDs and redacted structured logs, WhiteNoise static serving, database cache configuration, and a Gunicorn runbook.
- Changed API list endpoints to bounded pagination (100 records/page); frontend loaders follow same-origin pagination links.
- Required an HTTPS production API URL at Vite build time and rejected missing, localhost, or HTTP production API URLs.
- Added DB uniqueness for tenant phone after a read-only duplicate check found no collisions; migration `tenants.0004_tenant_unique_tenant_phone` is applied.
- Added an exact per-charge allocation breakdown to payment receipt API output. Multi-charge receipts now reflect actual allocated amounts and balances at the time of those allocations.
- Upgraded Django to 5.2.19, DRF to 3.18.3, and python-dotenv to 1.2.4; added a minimatch override and updated the npm lockfile.
- Added PostgreSQL concurrency tests, deployment/recovery instructions, and GitHub Actions gates for PostgreSQL tests, audits, lint, migrations, and build. The lint gate currently fails as detailed below.

### Verification performed

| Area | Test/method | Result |
| --- | --- | --- |
| Backend regression suite | `manage.py test` using isolated SQLite test DB | 87 passed, 0 failures, 7 PostgreSQL-only skips. One additional sub-cent precision regression was run separately and passed. |
| PostgreSQL concurrency | Seven `TransactionTestCase` scenarios in separate uniquely named `test_rentalhub_audit_test_20261109_7d914a3f`, using two real worker threads and synchronization barriers | 7 passed: contested charge allocation, duplicate transaction reference, concurrent receipts across rooms, duplicate tenant, duplicate room, competing deposit refunds, and concurrent rent generation. Django destroyed the isolated test database. |
| Migration state | `showmigrations tenants`, `migrate --plan`, `makemigrations --check --dry-run` | `0004` applied; no unapplied model changes. |
| Configured database safety | Read-only duplicate-phone precheck before migration; after migration, read-only transaction compared counts and ledger aggregates | Counts remain 1 property, 6 rooms, 11 tenants, 11 tenancies, 17 charges, 14 payments, 14 allocations, 11 deposits, 4 expenses. Payment/allocation, charge/paid, deposit/deduction mismatches are all zero; no duplicate active tenants/rooms. Charge ID 4 remains 10,000.00 face / 14,000.00 paid. No live financial row was edited by this pass; the only new live change was an additive unique constraint. |
| Python dependencies | `pip-audit -r requirements.txt` | No known vulnerabilities in declared application requirements. |
| npm dependencies | `npm audit` and `npm audit --omit=dev` after lockfile update | 0 vulnerabilities, including development dependencies. |
| Frontend build | Production build with synthetic HTTPS `VITE_API_BASE_URL` | Passed. Vite warns the largest minified bundle is about 885 KB; code splitting/performance remains. |
| Frontend lint | `npm run lint` | Fails: 52 errors and 2 warnings across frontend code, primarily `no-explicit-any`, synchronous state updates in effects, and context export rules. No lint rules were weakened. |
| Production Django check | `manage.py check --deploy` with synthetic non-production settings | No errors; warnings require a deliberate decision on HSTS subdomains and preload after domain ownership/HTTPS is established. |

### Financial operation behavior and remaining accounting limits

- Explicit `chargeId` is honored as the primary target; spillover uses outstanding charges in month/due-date order. Without `chargeId`, the payment-date month charge is preferred, then the oldest unpaid charge; if none exists, a charge for the payment month is created. Future-dated payments therefore currently create future-month charges. This is observed behavior, not confirmed business approval; it was not changed.
- Payments larger than outstanding rent are rejected; partial and multi-charge allocations are supported; no unapplied credit balance is accepted. The business owner should confirm this policy before changing it.
- Payment history cannot be edited or deleted through the API. There is no compensating reversal/correction endpoint yet; reversal tests cannot exercise a workflow that does not exist. Any accounting correction needs an auditable compensating-entry design.
- A historical KSh 4,000 over-allocation on charge ID 4 remains untouched. New allocation logic prevents additional over-allocation through the payment endpoint.
- The configured database connection still uses a PostgreSQL superuser and has TLS disabled. Production settings reject that role and require PostgreSQL TLS. Do not deploy using the current database credentials.

### Hosting decision

**Not ready for public hosting.** Code-level safeguards, schema checks, isolated tests, and runbooks are in place, but the current database credentials/transport are unsuitable for hosting, no destination/provider/domain or SMTP/backup secrets have been chosen, no encrypted backup/restore drill is available, the frontend lint gate fails, and no hosted browser/HTTPS smoke test has occurred. The production runbook identifies the release sequence and candidate RPO/RTO (15 minutes / 4 hours); those objectives are not yet demonstrated.

## Initial priority order

1. Prevent partial writes in settings and restrict unsafe API/admin write paths.
2. Introduce production-only settings validation and secure session/CSRF authentication; add login throttling and password reset.
3. Add health/readiness, safe logs, static serving and production WSGI launch configuration.
4. Isolate PostgreSQL concurrency tests; verify TLS and least-privilege role with the actual hosting database.
5. Build repeatable encrypted backups and verify restoration on a separate database.
6. Configure hosting/domain/HTTPS after the destination is selected, then run browser smoke tests.
7. Keep charge ID 4 unchanged pending human accounting approval.

## Audit caveats

- Provider, domain, SMTP, backup storage, monitoring provider and credentials are not specified; those items cannot be honestly marked complete without them.
- No public deployment is authorized.
- The live database has been queried read-only for audit evidence; production migrations already applied in the previous turn are not being reversed.
