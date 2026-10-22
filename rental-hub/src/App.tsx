import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RentalProvider } from './context/RentalContext';
import { AppShell } from './components/layout/AppShell';
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

function App() {
  return (
    <RentalProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
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
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </RentalProvider>
  );
}

export default App;
