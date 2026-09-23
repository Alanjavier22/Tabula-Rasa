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
  CreditCard,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import CommandPalette from './CommandPalette';
import { SentinelBubble } from './SentinelBubble';

type LayoutProps = {
  children: React.ReactNode;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

const Layout = ({ children, theme, onToggleTheme }: LayoutProps) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('tabula_sidebar_collapsed') === 'true';
  });

  const navItems = [
    { path: '/', label: 'Panel Principal', shortLabel: 'Resumen', icon: LayoutDashboard },
    { path: '/transactions', label: 'Transacciones', shortLabel: 'Movimientos', icon: ArrowUpDown },
    { path: '/categories', label: 'Categorías', shortLabel: 'Categorías', icon: Tag },
    { path: '/accounts', label: 'Cuentas', shortLabel: 'Cuentas', icon: Wallet },
    { path: '/budgets', label: 'Presupuestos', shortLabel: 'Presupuestos', icon: PieChart },
    { path: '/goals', label: 'Metas', shortLabel: 'Metas', icon: Target },
    { path: '/reminders', label: 'Recordatorios', shortLabel: 'Alertas', icon: Bell },
    { path: '/subscriptions', label: 'Suscripciones', shortLabel: 'Suscripciones', icon: CreditCard },
    { path: '/snapshots', label: 'Snapshots', shortLabel: 'Snapshots', icon: Calendar },
    { path: '/fiscal', label: 'SRI Fiscal', shortLabel: 'SRI Fiscal', icon: Receipt },
    { path: '/settings', label: 'Configuración', shortLabel: 'Configuración', icon: SettingsIcon },
  ];

  const currentPage = navItems.find((item) => item.path === location.pathname) ?? navItems[0];
  const isActive = (path: string) => location.pathname === path;

  const handleToggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('tabula_sidebar_collapsed', String(newState));
  };

  const themeLabel = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'app-shell-collapsed' : ''}`}>
      <CommandPalette />
      <SentinelBubble />

      <aside className="app-sidebar" aria-label="Navegación principal">
        <div className="app-brand">
          <div className="app-brand-mark" aria-hidden="true">TR</div>
          {!sidebarCollapsed && (
            <div className="app-brand-copy">
              <strong>Tabula Rasa</strong>
              <span>Finanzas privadas</span>
            </div>
          )}
        </div>

        <div className="app-sidebar-tools">
          <button
            type="button"
            className="app-icon-button app-sidebar-collapse"
            onClick={handleToggleSidebar}
            aria-label={sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'}
            title={sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'}
          >
            {sidebarCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
          </button>
        </div>

        <nav className="app-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                title={sidebarCollapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`app-nav-item ${active ? 'is-active' : ''}`}
              >
                <Icon aria-hidden="true" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar-bottom">
          <button type="button" className="app-nav-item app-theme-nav" onClick={onToggleTheme} title={themeLabel}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {!sidebarCollapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
          </button>
          {!sidebarCollapsed && (
            <div className="app-sync-status"><span className="app-status-dot" aria-hidden="true" /> Datos sincronizados</div>
          )}
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-breadcrumb"><span>Finanzas</span><span aria-hidden="true">/</span><strong>{currentPage.label}</strong></div>
          <div className="app-topbar-actions">
            <button
              type="button"
              className="app-icon-button"
              aria-label="Abrir paleta de comandos"
              title="Buscar (Ctrl + K)"
              onClick={() => window.dispatchEvent(new Event('tabula:open-command-palette'))}
            >
              <Search aria-hidden="true" />
            </button>
            <div className="app-avatar" aria-label="Perfil de usuario">AM</div>
          </div>
        </header>

        <header className="app-mobile-header">
          <div className="app-brand app-brand-mobile">
            <div className="app-brand-mark" aria-hidden="true">TR</div>
            <div className="app-brand-copy"><strong>Tabula Rasa</strong><span>Finanzas privadas</span></div>
          </div>
          <button type="button" className="app-icon-button" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </header>

        <main className="app-content">{children}</main>
      </div>

      <nav className="app-mobile-nav" aria-label="Navegación móvil">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link key={item.path} to={item.path} aria-current={active ? 'page' : undefined} className={`app-mobile-nav-item ${active ? 'is-active' : ''}`}>
              <Icon aria-hidden="true" />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
        <button type="button" className={`app-mobile-nav-item ${mobileMenuOpen ? 'is-active' : ''}`} onClick={() => setMobileMenuOpen(true)} aria-expanded={mobileMenuOpen}>
          <Menu aria-hidden="true" />
          <span>Más</span>
        </button>
      </nav>

      <div className={`app-mobile-menu ${mobileMenuOpen ? 'is-open' : ''}`} aria-hidden={!mobileMenuOpen}>
        <button type="button" className="app-mobile-menu-backdrop" aria-label="Cerrar menú móvil" onClick={() => setMobileMenuOpen(false)} />
        <section className="app-mobile-menu-panel" aria-label="Más opciones">
          <div className="app-mobile-menu-heading"><div><span className="app-kicker">Navegación</span><h2>Más opciones</h2></div><button type="button" className="app-icon-button" aria-label="Cerrar menú móvil" onClick={() => setMobileMenuOpen(false)}><X aria-hidden="true" /></button></div>
          <div className="app-mobile-menu-grid">
            {navItems.slice(4).map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link key={item.path} to={item.path} onClick={() => setMobileMenuOpen(false)} aria-current={active ? 'page' : undefined} className={`app-mobile-menu-item ${active ? 'is-active' : ''}`}>
                  <Icon aria-hidden="true" /><span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Layout;
