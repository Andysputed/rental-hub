# RentalHub production deployment runbook

This is a provider-neutral runbook. The application is **not cleared for public hosting** until the unresolved provider, database, email, backup, privacy, and frontend lint items in `PRODUCTION_READINESS_AUDIT.md` are closed.

## Supported application stack

- Python 3.12; Django 5.2 LTS; Django REST Framework 3.18.
- PostgreSQL with TLS and a dedicated least-privilege application role.
- Gunicorn serving `config.wsgi:application` from `backend/`.
- React/Vite static frontend built from `rental-hub/` and served over HTTPS.

Use the exact dependency constraints in `backend/requirements.txt` and `rental-hub/package-lock.json`. Run dependency audits before release.

## Required production environment

Set secrets in the host’s secret manager. Never commit them or place them in build logs.

| Variable | Requirement |
| --- | --- |
| `DJANGO_SETTINGS_MODULE` | `config.production_settings` |
| `DEBUG` | Explicitly `false` |
| `SECRET_KEY` | Random, unique, 50+ characters; rotate via a planned session invalidation |
| `ALLOWED_HOSTS` | Comma-separated deployed API hostnames only |
| `CORS_ALLOWED_ORIGINS` | Exact HTTPS frontend origins |
| `CSRF_TRUSTED_ORIGINS` | Exact HTTPS frontend/API origins that submit cookie-authenticated requests |
| `DB_ENGINE` | `postgresql` |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Dedicated production database and non-superuser role |
| `DB_SSLMODE` | `require` minimum; prefer `verify-full` with `DB_SSL_ROOT_CERT` |
| `DB_CONNECT_TIMEOUT`, `DB_CONN_MAX_AGE` | Bounded connection behavior |
| `HTTPS_CONFIRMED` | Set `true` only after end-to-end HTTPS and proxy forwarding are verified |
| `SECURE_HSTS_SECONDS` | Positive value only after HTTPS is stable |
| `TRUST_PROXY_SSL_HEADER` | Enable only if the chosen proxy overwrites the header and blocks direct app access |
| `FRONTEND_PASSWORD_RESET_URL` | HTTPS URL for the frontend reset confirmation page |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | Authenticated production SMTP; configure exactly one of TLS or SSL |
| `RENTALHUB_PROPERTY_ID` | Existing property primary key to serve |
| `CACHE_TABLE` | Optional; defaults to `rentalhub_cache` |

The frontend build requires `VITE_API_BASE_URL` to be an absolute HTTPS URL ending at the deployed API base (normally `/api/v1`). Production builds reject missing, HTTP, or localhost API URLs. Build the frontend with this public, non-secret URL; do not put backend secrets in Vite variables.

Cookie authentication requires credentials-enabled CORS and correct CSRF origins. Prefer placing the frontend and API on the same site. For genuinely cross-site domains, verify browser third-party-cookie behavior and configure `COOKIE_SAMESITE=None` only with HTTPS and a tested deployment.

## Release sequence

1. Provision a separate staging database and application role. Verify TLS, role grants, allowed database/schema access, backups, and restore permissions.
2. Run backend tests, PostgreSQL concurrency tests, `pip-audit`, `npm audit`, frontend build, and frontend lint. Do not promote while a required check fails.
3. Review `python manage.py migrate --plan` against the target database. Back up the target first and verify the restore procedure before applying a schema change.
4. Apply additive migrations once with `python manage.py migrate --noinput`. Never run seed/reset/flush commands against production.
5. Initialize the shared database cache once with `python manage.py createcachetable` if it is not already present. This command creates only the configured cache table; confirm its name and target database before running.
6. Collect static files with `python manage.py collectstatic --noinput` and serve `STATIC_ROOT` through WhiteNoise or the host’s static service.
7. Start the API with a bounded worker count, for example:

   ```text
   gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 30 --access-logfile - --error-logfile -
   ```

   Set the port and worker count using the selected host’s process model and memory limits. Do not expose Django’s development server.

8. Configure the static host’s SPA fallback to `index.html`, HTTPS-only access, and appropriate security headers. Keep API paths routed to Django.
9. Create the initial landlord superuser through a one-time secure management process. Do not create default credentials or enable public self-registration.
10. Smoke-test liveness, readiness, login, CSRF-protected writes, password reset delivery, admin static files, pagination, and logout using synthetic accounts and records.
11. Verify database role/TLS from the running application, request IDs and redacted logs, alert delivery, backup freshness, and a restore into a separate database before opening traffic.

## Backup and recovery targets

Candidate service objectives, to be approved against the selected database provider and budget:

- **RPO:** 15 minutes, using continuous/WAL-capable backups or equivalent point-in-time recovery.
- **RTO:** 4 hours, including database restore, application configuration recovery, and smoke tests.

These are targets, not demonstrated capabilities. Before launch, configure encrypted backups, retention and access controls, record the last successful restore test, and confirm no restored database can receive production traffic accidentally. A backup is not verified until a separate restore has been queried and the app smoke-tested.

## Rollback

- Prefer application rollback while retaining the additive schema. Confirm the prior app version remains compatible with the new schema.
- Do not reverse a financial-data migration or delete ledger rows as an operational rollback. If schema rollback is unavoidable, take a fresh verified backup and obtain a reviewed, provider-specific plan.
- Correct financial mistakes with an auditable compensating workflow. Payment reversal is not currently available through the API; do not edit/delete historical payments or allocations manually.
- If a release caused writes to be wrong, stop writes, preserve logs and request IDs, take a protected backup, and prepare a reviewed reconciliation plan before restoring or correcting records.

## Privacy and operational sign-off

Tenant names, contact details, tenancy history, and money records are personal data. Before launch, obtain independent Kenya Data Protection Act/privacy review; publish a privacy notice; define retention, access, export, deletion-request, and breach response processes; and identify the data controller/processor and hosting locations. This repository audit does not certify legal compliance.
