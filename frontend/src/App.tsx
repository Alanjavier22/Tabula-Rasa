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

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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
