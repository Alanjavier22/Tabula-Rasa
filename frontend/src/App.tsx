import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { MotionConfig } from 'framer-motion';
import Layout from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';
import { snapshotsAPI } from './services/api';

// Lazy load pages for chunking optimization
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Categories = lazy(() => import('./pages/Categories'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Goals = lazy(() => import('./pages/Goals'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Settings = lazy(() => import('./pages/Settings'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Snapshots = lazy(() => import('./pages/Snapshots'));
const Fiscal = lazy(() => import('./pages/Fiscal'));

// Premium, elegant page loader spinner
const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] w-full space-y-4">
    <div className="w-12 h-12 border-4 border-line border-t-transparent rounded-full animate-spin"></div>
    <output className="text-sm text-muted font-medium">Cargando sección…</output>
  </div>
);

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('ui_theme') as 'light' | 'dark' | null;
    // Adopt the chosen light default once, including installations with the old dark preference.
    return localStorage.getItem('ui_theme_default_version') === 'editorial-light-v1'
      && savedTheme === 'dark' ? 'dark' : 'light';
  });

  // FASE 8: Integrity Heartbeat - Runs every 24 hours or on startup
  useEffect(() => {
    const runIntegrityHeartbeat = async () => {
      try {
        const snapshots = await snapshotsAPI.getAll();
        const staleCount = snapshots.data.filter((s) => s.is_stale).length;
        if (staleCount > 5) {
          await snapshotsAPI.reconcile();
        }
      } catch (error) {
        console.warn('No se pudo verificar la integridad de snapshots vía API:', error);
      }
    };

    // Run heartbeat on startup
    const heartbeatKey = 'last_integrity_heartbeat';
    const runHeartbeat =  () => {
      const now = Date.now();
      const lastHeartbeat = localStorage.getItem(heartbeatKey);
      const heartbeatInterval = 24 * 60 * 60 * 1000; // 24 hours

      if (!lastHeartbeat || now - Number.parseInt(lastHeartbeat) > heartbeatInterval) {
        // Use requestIdleCallback if available, otherwise run immediately
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => runIntegrityHeartbeat());
        } else {
          setTimeout(() => runIntegrityHeartbeat(), 1000);
        }
        localStorage.setItem(heartbeatKey, now.toString());
      }
    };

    runHeartbeat();
  }, []);

  useEffect(() => {
    // Light is the default product theme. A user-selected preference is
    // preserved, while both html and body expose the theme to CSS tokens.
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    localStorage.setItem('ui_theme', theme);
    localStorage.setItem('ui_theme_default_version', 'editorial-light-v1');
  }, [theme]);

  return (
    <MotionConfig reducedMotion="user">
    <GlobalErrorBoundary>
      <Router>
        <AuthGuard>
          <Layout
            theme={theme}
            onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
          >
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/reminders" element={<Reminders />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/snapshots" element={<Snapshots />} />
                <Route path="/fiscal" element={<Fiscal />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Suspense>
          </Layout>
        </AuthGuard>
      </Router>
    </GlobalErrorBoundary>
    </MotionConfig>
  );
}

export default App;
