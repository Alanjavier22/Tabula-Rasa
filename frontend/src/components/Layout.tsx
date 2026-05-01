import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  ArrowUpDown,
  Tag,
  Wallet,
  Target,
  PieChart,
  Bell,
  Menu,
  X,
  Settings as SettingsIcon,
  Calendar,
  CreditCard
} from 'lucide-react';
import CommandPalette from './CommandPalette';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { ConflictBadge } from './ConflictBadge';
import { IntegrityBadge } from './common/IntegrityBadge';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Panel Principal', icon: LayoutDashboard },
    { path: '/transactions', label: 'Transacciones', icon: ArrowUpDown },
    { path: '/categories', label: 'Categorías', icon: Tag },
    { path: '/accounts', label: 'Cuentas', icon: Wallet },
    { path: '/budgets', label: 'Presupuestos', icon: PieChart },
    { path: '/goals', label: 'Metas', icon: Target },
    { path: '/reminders', label: 'Recordatorios', icon: Bell },
    { path: '/subscriptions', label: 'Suscripciones', icon: CreditCard },
    { path: '/snapshots', label: 'Snapshots', icon: Calendar },
    { path: '/settings', label: 'Configuración', icon: SettingsIcon },
  ];

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <CommandPalette />
      {/* Mobile Top Header */}
      <header className="lg:hidden fixed top-0 w-full z-30 bg-slate-800/80 backdrop-blur-xl border-b border-slate-700/50 flex justify-between items-center px-4 py-3">
        <h1 className="text-lg font-bold text-white bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Finanzas</h1>
        <div className="flex items-center gap-2">
          <ConflictBadge />
          <SyncStatusIndicator />
        </div>
      </header>

      {/* Mobile Bottom Navigation (Native App Feel) */}
      <nav className="lg:hidden fixed bottom-0 w-full z-40 bg-slate-800/95 backdrop-blur-2xl border-t border-slate-700/50 pb-safe pt-1 px-2 flex justify-around items-center h-16">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                isActive ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
        {/* "More" Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            mobileMenuOpen ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">Más</span>
        </button>
      </nav>

      {/* Mobile Expanded Menu (Slide-up or Fullscreen) */}
      <div className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}></div>
        <div className={`absolute bottom-0 left-0 w-full bg-slate-900 border-t border-slate-700/50 rounded-t-3xl transition-transform duration-300 transform ${mobileMenuOpen ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex justify-between items-center p-6 border-b border-slate-800">
            <h2 className="text-xl font-bold text-white">Más Opciones</h2>
            <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
            {navItems.slice(4).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col items-center justify-center p-4 bg-slate-800 rounded-2xl border border-slate-700/50 hover:bg-slate-700 transition-colors"
                >
                  <Icon className="w-6 h-6 text-purple-400 mb-2" />
                  <span className="text-sm font-medium text-slate-200">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-slate-800/50 backdrop-blur-xl border-r border-slate-700/50 fixed h-full z-10 hidden lg:block overflow-y-auto scrollbar-hide">
        <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Finanzas Personales</h1>
            <p className="text-sm text-slate-300 mt-1">Sistema de Gestión</p>
          </div>
        </div>
        <div className="px-6 py-2 border-b border-slate-700/50 flex items-center gap-2">
          <IntegrityBadge />
          <ConflictBadge />
          <SyncStatusIndicator />
        </div>
        <nav className="mt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-6 py-4 transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white border-l-4 border-purple-400'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-16 pb-20 lg:pt-8 lg:pb-8 p-4 overflow-x-hidden w-full">
        {children}
      </main>
    </div>
  );
};

export default Layout;
