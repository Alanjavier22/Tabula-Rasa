import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Menu, X, ChevronLeft, ChevronRight, Moon, Search, Sun } from 'lucide-react';
import Modal from './common/Modal';
import { navigationGroups, navigationItems, mobileItems } from '../utils/navigation';
import CommandPalette from './CommandPalette';
import { SentinelBubble } from './SentinelBubble';

type LayoutProps = {
  children: React.ReactNode;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

const Layout = ({ children, theme, onToggleTheme }: LayoutProps) => {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('tabula_sidebar_collapsed') === 'true';
  });

  const currentPage = navigationItems.find((item) => item.path === location.pathname) ?? navigationItems[0];
  const isActive = (path: string) => location.pathname === path;

  const handleToggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('tabula_sidebar_collapsed', String(newState));
  };

  const themeLabel = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  useEffect(() => {
    // Each route owns its own page position. Without this reset, navigating
    // from a long screen leaves the next screen halfway down the document.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'app-shell-collapsed' : ''}`}>
      <a className="app-skip-link" href="#main-content">Saltar al contenido</a>
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
          {navigationGroups.map(group => (
            <div className="app-nav-group" key={group.label}>
              <p className="app-nav-group-label">{group.label}</p>
              {group.items.map(item => {
                const Icon = item.icon;
                return <Link key={item.path} to={item.path} title={item.label} aria-label={item.label}
                  aria-current={isActive(item.path) ? 'page' : undefined}
                  className={`app-nav-item ${isActive(item.path) ? 'is-active' : ''}`}>
                  <Icon aria-hidden="true" />{!sidebarCollapsed && <span>{item.label}</span>}
                </Link>;
              })}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-bottom">
          <button type="button" className="app-nav-item app-theme-nav" onClick={onToggleTheme} title={themeLabel}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {!sidebarCollapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
          </button>
        </div>
      </aside>

      <div ref={mainRef} className="app-main">
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

        <main id="main-content" tabIndex={-1} className="app-content">{children}</main>
      </div>

      <nav className="app-mobile-nav" aria-label="Navegación móvil">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link key={item.path} to={item.path} aria-current={active ? 'page' : undefined} className={`app-mobile-nav-item ${active ? 'is-active' : ''}`}>
              <Icon aria-hidden="true" />
              <span>{item.path === '/transactions' ? 'Actividad' : item.path === '/budgets' ? 'Planificar' : item.label}</span>
            </Link>
          );
        })}
        <button type="button" className={`app-mobile-nav-item ${mobileMenuOpen ? 'is-active' : ''}`} onClick={() => setMobileMenuOpen(true)} aria-expanded={mobileMenuOpen}>
          <Menu aria-hidden="true" />
          <span>Más</span>
        </button>
      </nav>

      {mobileMenuOpen && <Modal onClose={() => setMobileMenuOpen(false)} label="Navegación" className="app-mobile-navigation-dialog">
        <section className="app-mobile-menu-panel">
          <div className="app-mobile-menu-heading"><h2>Navegación</h2><button type="button" className="app-icon-button" aria-label="Cerrar navegación" onClick={() => setMobileMenuOpen(false)}><X aria-hidden="true" /></button></div>
          {navigationGroups.map(group => <div key={group.label}>
            <h3 className="app-nav-group-label">{group.label}</h3>
            <div className="app-mobile-menu-grid">{group.items.map(item => {
              const Icon = item.icon;
              return <Link key={item.path} to={item.path} onClick={() => setMobileMenuOpen(false)}
                aria-current={isActive(item.path) ? 'page' : undefined} className={`app-mobile-menu-item ${isActive(item.path) ? 'is-active' : ''}`}>
                <Icon aria-hidden="true" /><span>{item.label}</span>
              </Link>;
            })}</div>
          </div>)}
        </section>
      </Modal>}

    </div>
  );
};

export default Layout;
