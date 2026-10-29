import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RentalProvider } from './context/RentalContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { RoomsPage } from './pages/RoomsPage';
import { RegisterTenantPage } from './pages/RegisterTenantPage';
import { TenantDetailsPage } from './pages/TenantDetailsPage';
import { TenantsPage } from './pages/TenantsPage';
import { RentChargesPage } from './pages/RentChargesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { RecordPaymentPage } from './pages/RecordPaymentPage';
import { ReceiptPage } from './pages/ReceiptPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { AddExpensePage } from './pages/AddExpensePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { DepositsPage } from './pages/DepositsPage';
import { Home } from 'lucide-react';

/**
 * Shows a full-screen spinner while the auth context validates any stored token.
 */
function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center">
        <Home size={20} className="text-white" strokeWidth={2.2} />
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <svg className="animate-spin w-4 h-4 text-brand-700" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Loading RentalHub…</span>
      </div>
    </div>
  );
}

/**
 * Wraps protected routes. Redirects unauthenticated users to /login.
 * Shows a loading screen while the stored token is being validated.
 */
function ProtectedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <RentalProvider>
      <AppShell />
    </RentalProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: login */}
          <Route path="/login" element={<LoginRedirect />} />

          {/* Protected: all app routes under AppShell */}
          <Route path="/" element={<ProtectedRoutes />}>
            <Route index element={<DashboardPage />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route path="rooms/register" element={<RegisterTenantPage />} />
            <Route path="rooms/:roomId" element={<TenantDetailsPage />} />
            <Route path="tenants" element={<TenantsPage />} />
            <Route path="tenants/:tenantId" element={<TenantDetailsPage />} />
            <Route path="rent-charges" element={<RentChargesPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="payments/record" element={<RecordPaymentPage />} />
            <Route path="payments/receipt/:paymentId" element={<ReceiptPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="expenses/add" element={<AddExpensePage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="deposits" element={<DepositsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

/**
 * If the user is already logged in, redirect away from /login to the dashboard.
 */
function LoginRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoadingScreen />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default App;
