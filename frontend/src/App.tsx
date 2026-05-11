import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Accounts from './pages/Accounts';
import Budgets from './pages/Budgets';
import Goals from './pages/Goals';
import Reminders from './pages/Reminders';
import Settings from './pages/Settings';
import Subscriptions from './pages/Subscriptions';
import Snapshots from './pages/Snapshots';
import Fiscal from './pages/Fiscal';
import PairingPage from './pages/PairingPage';
import { AuthGuard } from './components/AuthGuard';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';
import { validateCacheIntegrity } from './services/AICategorizationService';
import { checkStorageQuota } from './utils/storage';
import { snapshotsAPI } from './services/api';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // FASE 8: Integrity Heartbeat - Runs every 24 hours or on startup
  useEffect(() => {
    const runIntegrityHeartbeat = async () => {
      try {
        console.log('🛡️ Pulso de Integridad: Iniciando...');
        
        // 1. Validate AI cache integrity
        const integrityResult = await validateCacheIntegrity();
        console.log(`🧠 Integridad de caché de IA: ${integrityResult.deleted} entradas huérfanas eliminadas`);
        
        // 2. Check storage health
        const storage = await checkStorageQuota();
        console.log(`💾 Salud del almacenamiento: ${storage.usagePercent.toFixed(2)}% (${storage.status === 'healthy' ? 'Saludable' : storage.status})`);
        
        // 3. Check stale snapshots and reconcile if >5
        // Thin Client: Use backend API instead of IndexedDB
        try {
          const snapshots = await snapshotsAPI.getAll();
          const staleCount = snapshots.data.filter((s: any) => s.is_stale).length;
          if (staleCount > 5) {
            console.log(`🔍 Se encontraron ${staleCount} snapshots obsoletos, iniciando reconciliación...`);
            await snapshotsAPI.reconcile();
            console.log('✅ Reconciliación completada');
          } else {
            console.log(`📊 Integridad de Snapshots: ${staleCount} snapshots obsoletos (OK)`);
          }
        } catch (error) {
          console.warn('⚠️ No se pudo verificar la integridad de snapshots vía API:', error);
        }
        
        console.log('🏁 Pulso de Integridad: Completado');
      } catch (error) {
        console.error('❌ Pulso de Integridad: Error:', error);
      }
    };

    // Run heartbeat on startup
    const heartbeatKey = 'last_integrity_heartbeat';
    const runHeartbeat = async () => {
      const now = Date.now();
      const lastHeartbeat = localStorage.getItem(heartbeatKey);
      const heartbeatInterval = 24 * 60 * 60 * 1000; // 24 hours
      
      if (!lastHeartbeat || now - parseInt(lastHeartbeat) > heartbeatInterval) {
        // Use requestIdleCallback if available, otherwise run immediately
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(() => runIntegrityHeartbeat());
        } else {
          setTimeout(() => runIntegrityHeartbeat(), 1000);
        }
        localStorage.setItem(heartbeatKey, now.toString());
      }
    };
    
    runHeartbeat();
  }, []);

  useEffect(() => {
    // Load theme from localStorage (Thin Client: no IndexedDB)
    const savedTheme = localStorage.getItem('ui_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    // Apply theme to body
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [theme]);

  return (
    <GlobalErrorBoundary>
      <Router>
        <AuthGuard>
          <Layout>
            <AnimatePresence mode="wait">
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
                <Route path="/pair" element={<PairingPage />} />
              </Routes>
            </AnimatePresence>
          </Layout>
        </AuthGuard>
      </Router>
    </GlobalErrorBoundary>
  );
}

export default App;
