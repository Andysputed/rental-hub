# RentalHub — Full-Stack Rental Management System

A mobile-first rental property management system designed for managing a single 6-room residential property in Nairobi, Kenya (Acacia House).

RentalHub couples a **React + TypeScript + Vite + Tailwind CSS** frontend with a robust, financially compliant **Django REST Framework (DRF)** backend backed by **PostgreSQL** (with dual-engine SQLite support for local offline development).

---

## 🌟 System Architecture

```
Rental-Hub/
├── backend/                  # Django REST Framework backend
│   ├── config/               # Project configuration, settings, root URL router
│   ├── apps/
│   │   ├── properties/       # Property, PropertySettings, Room models & APIs
│   │   ├── tenants/          # Tenant, Tenancy (active room constraint)
│   │   ├── rent/             # RentCharge (idempotent billing, duplicate prevention)
│   │   ├── payments/         # Payment, PaymentAllocation, Deposit ledger
│   │   ├── expenses/         # Expense tracking & categories
│   │   └── reports/          # Cash-basis reports & Dashboard metrics
│   ├── tests/                # Automated test suite (24 unit & integration tests)
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Backend environment template
│   └── manage.py
└── rental-hub/               # React + TypeScript + Vite frontend
    ├── src/
    │   ├── components/       # Reusable UI & wireframe-faithful components
    │   ├── context/          # RentalContext (typed, async API integration)
    │   ├── pages/            # 13 core screens (Dashboard, Rooms, Register, Ledger, etc.)
    │   ├── services/         # Centralized API client (api.ts)
    │   ├── types/            # Strict TypeScript interfaces
    │   └── utils/            # Currency (KES / KSh) & date formatters
    ├── .env.example          # Frontend environment template (VITE_API_BASE_URL)
    └── package.json
```

---

## 🔑 Key Features & Financial Compliance

1. **Kenyan Shilling (KES) Strict Decimal Ledger**:
   - All financial amounts use `DecimalField(max_digits=12, decimal_places=2)`. Floating point math is strictly prohibited.
2. **Segregated Security Deposit Ledger**:
   - Deposits are maintained in an isolated ledger and never co-mingled with rent revenue or operating income.
3. **Idempotent Rent Charge Generation**:
   - Database constraint (`unique_rent_charge_per_tenancy_month`) prevents duplicate monthly charges. Vacant rooms are automatically skipped.
4. **Single Active Tenancy Constraint**:
   - Database constraint (`unique_active_tenancy_per_room`) ensures no two active tenancies can occupy the same room simultaneously.
5. **Cash-Basis Monthly Reporting**:
   - Rent charged vs. cash collected are clearly distinguished. Net operating income reconciles against ledger entries.
6. **Sequential Receipt Generation**:
   - Real-time receipt generation (`RH-YYYY-XXX`) with full payment allocation breakdown, printable and sharable via WhatsApp/Email.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18+ and `npm`
- **Python**: v3.12+
- **PostgreSQL**: v16+ (Optional for local testing; SQLite is built-in as an instant development fallback)

---

### Step 1: Start the Django Backend

1. Open PowerShell and navigate to the `backend` directory:
   ```powershell
   cd backend
   ```

2. Activate the virtual environment:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

3. Ensure dependencies are installed:
   ```powershell
   pip install -r requirements.txt
   ```

4. Apply migrations:
   ```powershell
   python manage.py migrate
   ```

5. (Optional) Populate seed development data (6 rooms, 5 active tenants, October charges, payments):
   ```powershell
   python manage.py seed_dev_data
   ```

6. Start the API server:
   ```powershell
   python manage.py runserver 0.0.0.0:8000
   ```
   *The API will be available at `http://localhost:8000/api/v1/`.*

---

### Step 2: Start the React Frontend

1. Open a second PowerShell terminal and navigate to `rental-hub`:
   ```powershell
   cd rental-hub
   ```

2. Ensure environment configuration is present:
   ```powershell
   # Ensure .env contains:
   # VITE_API_BASE_URL=http://localhost:8000/api/v1
   ```

3. Start the Vite development server:
   ```powershell
   npm run dev
   ```
   *The web application will be accessible at `http://localhost:5173/`.*

---

## 🗄️ PostgreSQL Setup (Production / Local PostgreSQL)

To point the backend to a live PostgreSQL 16 database:

1. Create the database in PostgreSQL:
   ```sql
   CREATE DATABASE rentalhub;
   ```

2. Configure `backend/.env`:
   ```ini
   DEBUG=True
   SECRET_KEY=your-production-secret-key
   ALLOWED_HOSTS=localhost,127.0.0.1
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

   DB_ENGINE=postgresql
   DB_NAME=rentalhub
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password
   DB_HOST=localhost
   DB_PORT=5432
   ```

3. Run migrations against PostgreSQL:
   ```powershell
   python manage.py migrate
   ```

4. Populate initial data:
   ```powershell
   python manage.py seed_dev_data
   ```

---

## 🧪 Testing & Verification

### Running Backend Tests
Execute the comprehensive test suite covering models, database constraints, financial allocations, idempotency, and reporting:
```powershell
cd backend
.\.venv\Scripts\python.exe manage.py test tests
```
*Expected: 24 tests passing in < 1 second.*

### Running Frontend Production Build
Validate TypeScript types and asset bundles:
```powershell
cd rental-hub
npm run build
```
*Expected: `tsc -b && vite build` completes with 0 errors.*

---

## 📡 REST API Reference (`/api/v1/`)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/rooms/` | `GET`, `POST` | List all 6 rooms with current tenancy and occupancy status |
| `/rooms/{id}/` | `GET`, `PATCH` | Retrieve or update room details |
| `/settings/` | `GET`, `PATCH` | Retrieve or update property-wide settings (due day, default rent) |
| `/tenants/` | `GET`, `POST` | List and search tenant directory |
| `/tenancies/register/` | `POST` | Register a new tenant, assign a vacant room, record deposit |
| `/tenancies/{id}/move-out/` | `POST` | Record tenant move-out while preserving financial history |
| `/rent-charges/` | `GET` | List rent charges filtered by month/tenancy |
| `/rent-charges/generate/` | `POST` | Generate monthly charges (idempotent, skips vacant rooms) |
| `/payments/` | `GET`, `POST` | Record payments with allocations and auto-generated receipt number |
| `/payments/{id}/receipt/` | `GET` | Detailed receipt printable view data |
| `/expenses/` | `GET`, `POST` | Track operational expenses (maintenance, utilities, cleaning) |
| `/deposits/` | `GET` | Segregated security deposit ledger |
| `/dashboard/metrics/` | `GET` | Aggregated dashboard KPI cards & arrears |
| `/reports/monthly/` | `GET` | Cash-basis income statement & rent collection breakdown |
