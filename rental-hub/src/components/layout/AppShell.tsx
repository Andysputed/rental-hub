import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  DoorClosed,
  Wallet,
  Menu,
  X,
  Users,
  FileSpreadsheet,
  Receipt,
  PieChart,
  Settings,
  Bell,
  Home,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { useRental } from '../../context/useRental';
import { useAuth } from '../../context/useAuth';

export const AppShell: React.FC = () => {
  const { settings } = useRental();
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getBreadcrumbTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    if (path.startsWith('/rooms')) return 'Rooms';
    if (path.startsWith('/tenants')) return 'Tenants';
    if (path.startsWith('/rent-charges')) return 'Rent charges';
    if (path.startsWith('/payments/record')) return 'Record payment';
    if (path.startsWith('/payments/receipt')) return 'Payment receipt';
    if (path.startsWith('/payments')) return 'Payments';
    if (path.startsWith('/expenses/add')) return 'Add expense';
    if (path.startsWith('/expenses')) return 'Expenses';
    if (path.startsWith('/reports')) return 'Reports';
    if (path.startsWith('/deposits')) return 'Deposits';
    if (path.startsWith('/settings')) return 'Settings';
    return 'Overview';
  };

  const isMoreActive = ['/tenants', '/rent-charges', '/expenses', '/reports', '/deposits', '/settings'].some((p) =>
    location.pathname.startsWith(p)
  );

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col md:flex-row text-gray-900 font-sans antialiased">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden md:flex md:w-64 flex-col fixed inset-y-0 z-30 bg-white border-r border-[#E5E7EB] px-3.5 py-4 select-none">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-3 mb-3.5">
          <div className="w-8 h-8 rounded-lg bg-brand-700 flex items-center justify-center text-white shadow-2xs">
            <Home size={18} strokeWidth={2.2} />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">RentalHub</span>
        </div>

        {/* Property Card */}
        <div className="bg-[#F9FAF9] border border-[#E5E7EB] rounded-xl p-2.5 mb-3.5">
          <div className="text-xs font-bold text-gray-900 truncate">{settings.propertyName}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 truncate">{settings.location}</div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-0.5">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <LayoutGrid size={18} />
            <span>Overview</span>
          </NavLink>

          <NavLink
            to="/rooms"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <DoorClosed size={18} />
            <span>Rooms</span>
          </NavLink>

          <NavLink
            to="/tenants"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <Users size={18} />
            <span>Tenants</span>
          </NavLink>

          <NavLink
            to="/rent-charges"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <FileSpreadsheet size={18} />
            <span>Rent charges</span>
          </NavLink>

          <NavLink
            to="/payments"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <Wallet size={18} />
            <span>Payments</span>
          </NavLink>

          <NavLink
            to="/expenses"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <Receipt size={18} />
            <span>Expenses</span>
          </NavLink>

          <NavLink
            to="/reports"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <PieChart size={18} />
            <span>Reports</span>
          </NavLink>

          <NavLink
            to="/deposits"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <ShieldCheck size={18} />
            <span>Deposits</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#EBF5F0] text-brand-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
        </nav>

        {/* Landlord profile at sidebar bottom — always docked & clearly visible */}
        <div className="shrink-0 mt-auto pt-3 border-t border-[#E5E7EB] space-y-2">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-gray-50/80 border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-[#EBF5F0] text-brand-700 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200">
              {settings.landlordInitials || 'VK'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-gray-900 truncate">
                {settings.landlordName || 'Veronicah Kaptingei'}
              </div>
              <div className="text-[11px] text-gray-500 truncate">
                Landlord {user?.username ? `(@${user.username})` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium text-gray-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="no-print md:hidden bg-white border-b border-[#E5E7EB] px-4 py-3 sticky top-0 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-700 flex items-center justify-center text-white">
              <Home size={18} strokeWidth={2.2} />
            </div>
            <span className="text-lg font-bold text-gray-900">RentalHub</span>
          </div>

          <div className="w-8 h-8 rounded-full bg-[#EBF5F0] text-brand-700 font-semibold text-xs flex items-center justify-center">
            {settings.landlordInitials}
          </div>
        </header>

        {/* Desktop Top Header Bar */}
        <header className="no-print hidden md:flex bg-white border-b border-[#E5E7EB] px-8 py-3.5 items-center justify-between sticky top-0 z-20">
          <div className="text-xs font-medium text-gray-500">
            <span>{settings.propertyName}</span>
            <span className="mx-1.5">/</span>
            <span className="text-gray-900 font-semibold">{getBreadcrumbTitle()}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">As of 19 October 2026</span>
            <button
              type="button"
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              title="Sign out"
            >
              <LogOut size={14} />
              <span className="hidden lg:inline">Sign out</span>
            </button>
            <div className="w-8 h-8 rounded-full bg-[#EBF5F0] text-brand-700 font-semibold text-xs flex items-center justify-center">
              {settings.landlordInitials}
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 pb-24 md:pb-12 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8">
          <Outlet />
        </main>

        {/* Mobile Slide-over for "More" */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs" onClick={() => setMobileMenuOpen(false)} />
            <div className="relative bg-white rounded-t-2xl shadow-xl border-t border-[#E5E7EB] p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <span className="font-semibold text-gray-900">More options</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    navigate('/tenants');
                    setMobileMenuOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl border border-gray-100 bg-gray-50/70 hover:bg-[#EBF5F0] hover:text-brand-700 text-left transition-colors"
                >
                  <Users size={20} className="mb-2 text-brand-700" />
                  <span className="text-sm font-semibold text-gray-900">Tenants</span>
                  <span className="text-xs text-gray-500">Directory & info</span>
                </button>

                <button
                  onClick={() => {
                    navigate('/rent-charges');
                    setMobileMenuOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl border border-gray-100 bg-gray-50/70 hover:bg-[#EBF5F0] hover:text-brand-700 text-left transition-colors"
                >
                  <FileSpreadsheet size={20} className="mb-2 text-brand-700" />
                  <span className="text-sm font-semibold text-gray-900">Rent charges</span>
                  <span className="text-xs text-gray-500">Monthly ledger</span>
                </button>

                <button
                  onClick={() => {
                    navigate('/expenses');
                    setMobileMenuOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl border border-gray-100 bg-gray-50/70 hover:bg-[#EBF5F0] hover:text-brand-700 text-left transition-colors"
                >
                  <Receipt size={20} className="mb-2 text-brand-700" />
                  <span className="text-sm font-semibold text-gray-900">Expenses</span>
                  <span className="text-xs text-gray-500">Property costs</span>
                </button>

                <button
                  onClick={() => {
                    navigate('/reports');
                    setMobileMenuOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl border border-gray-100 bg-gray-50/70 hover:bg-[#EBF5F0] hover:text-brand-700 text-left transition-colors"
                >
                  <PieChart size={20} className="mb-2 text-brand-700" />
                  <span className="text-sm font-semibold text-gray-900">Reports</span>
                  <span className="text-xs text-gray-500">Cash summaries</span>
                </button>

                <button
                  onClick={() => {
                    navigate('/deposits');
                    setMobileMenuOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl border border-gray-100 bg-gray-50/70 hover:bg-[#EBF5F0] hover:text-brand-700 text-left transition-colors"
                >
                  <ShieldCheck size={20} className="mb-2 text-brand-700" />
                  <span className="text-sm font-semibold text-gray-900">Deposits</span>
                  <span className="text-xs text-gray-500">Security & refunds</span>
                </button>

                <button
                  onClick={() => {
                    navigate('/settings');
                    setMobileMenuOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl border border-gray-100 bg-gray-50/70 hover:bg-[#EBF5F0] hover:text-brand-700 text-left transition-colors col-span-2"
                >
                  <Settings size={20} className="mb-2 text-brand-700" />
                  <span className="text-sm font-semibold text-gray-900">Rent settings</span>
                  <span className="text-xs text-gray-500">Defaults & monthly billing</span>
                </button>
              </div>

              {/* Landlord profile in mobile slide-over */}
              <div className="pt-3 border-t border-gray-100 space-y-2.5">
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-9 h-9 rounded-full bg-[#EBF5F0] text-brand-700 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200">
                    {settings.landlordInitials || 'VK'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate">
                      {settings.landlordName || 'Veronicah Kaptingei'}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      Landlord {user?.username ? `(@${user.username})` : ''}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    await handleLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-red-100 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Bottom Navigation Bar */}
        <nav className="no-print md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E5E7EB] z-40 px-3 py-2 flex items-center justify-around shadow-sm select-none">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-colors ${
                isActive ? 'text-brand-700 font-semibold bg-[#EBF5F0]/60' : 'text-gray-500 hover:text-gray-900'
              }`
            }
          >
            <LayoutGrid size={20} />
            <span className="text-[11px] mt-1">Overview</span>
          </NavLink>

          <NavLink
            to="/rooms"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-colors ${
                isActive ? 'text-brand-700 font-semibold bg-[#EBF5F0]/60' : 'text-gray-500 hover:text-gray-900'
              }`
            }
          >
            <DoorClosed size={20} />
            <span className="text-[11px] mt-1">Rooms</span>
          </NavLink>

          <NavLink
            to="/payments"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-colors ${
                isActive ? 'text-brand-700 font-semibold bg-[#EBF5F0]/60' : 'text-gray-500 hover:text-gray-900'
              }`
            }
          >
            <Wallet size={20} />
            <span className="text-[11px] mt-1">Payments</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-colors ${
              isMoreActive ? 'text-brand-700 font-semibold bg-[#EBF5F0]/60' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Menu size={20} />
            <span className="text-[11px] mt-1">More</span>
          </button>
        </nav>
      </div>
    </div>
  );
};
