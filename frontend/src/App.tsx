import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
import { AuthGuard } from './components/AuthGuard';
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';
import { db } from './db/db';
import { v4 as uuidv4 } from 'uuid';
import { validateCacheIntegrity } from './services/AICategorizationService';
import { checkStorageQuota } from './utils/storage';
import { snapshotsAPI } from './services/api';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // FASE 8: Integrity Heartbeat - Runs every 24 hours or on startup
  useEffect(() => {
    const runIntegrityHeartbeat = async () => {
      try {
        console.log('[FASE-8] Integrity Heartbeat: Starting...');
        
        // 1. Validate AI cache integrity
        const integrityResult = await validateCacheIntegrity();
        console.log(`[FASE-8] AI cache integrity: ${integrityResult.deleted} orphaned entries deleted`);
        
        // 2. Check storage health
        const storage = await checkStorageQuota();
        console.log(`[FASE-8] Storage health: ${storage.usagePercent.toFixed(2)}% (${storage.status})`);
        
        // 3. Check stale snapshots and reconcile if >5
        // @ts-ignore
        const staleCount = await db.net_worth_snapshots.where('is_stale').equals(true).count();
        if (staleCount > 5) {
          console.log(`[FASE-8] Found ${staleCount} stale snapshots, triggering reconciliation...`);
          await snapshotsAPI.reconcile();
          console.log('[FASE-8] Reconciliation completed');
        } else {
          console.log(`[FASE-8] Snapshot integrity: ${staleCount} stale snapshots (OK)`);
        }
        
        console.log('[FASE-8] Integrity Heartbeat: Completed');
      } catch (error) {
        console.error('[FASE-8] Integrity Heartbeat: Error:', error);
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
    // Load theme from config on startup
    const loadTheme = async () => {
      try {
        // @ts-ignore
        const config = await db.config.where('key').equals('ui_theme').first();
        if (config && config.value) {
          setTheme(config.value as 'light' | 'dark');
        }
      } catch (error) {
        console.error('[App] Error loading theme:', error);
      }
    };
    loadTheme();
  }, []);

  useEffect(() => {
    // Apply theme to body
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);

    try {
      const now = new Date().toISOString();
      // @ts-ignore
      const existing = await db.config.where('key').equals('ui_theme').first();

      if (existing) {
        // @ts-ignore
        await db.config.update(existing.id, {
          value: newTheme,
          updated_at: now
        });
      } else {
        // @ts-ignore
        await db.config.add({
          id: uuidv4(),
          key: 'ui_theme',
          value: newTheme,
          is_deleted: false,
          updated_at: now
        });
      }

      // Trigger sync
      window.dispatchEvent(new CustomEvent('localMutation'));
    } catch (error) {
      console.error('[App] Error saving theme:', error);
    }
  };

  return (
    <GlobalErrorBoundary>
      <Router>
        <AuthGuard>
          <Layout>
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
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
        </AuthGuard>
      </Router>
    </GlobalErrorBoundary>
  );
}

export default App;
