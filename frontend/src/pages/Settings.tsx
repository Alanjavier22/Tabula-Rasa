import { useEffect, useState, useRef } from 'react';
import { configAPI, categoriesAPI, getTokenKey } from '../services/api';
import { Save, RefreshCw, LogOut, Download, Upload, FileSpreadsheet, Shield, Clock, AlertTriangle } from 'lucide-react';
import Toast from '../components/Toast';
import { SyncManager } from '../components/SyncManager';
import { db } from '../db/db';
import { formatMoney } from '../utils/money';
import type { Category } from '../types';

interface ConfigData {
  vehicle_categories: string[];
  safe_to_spend_buffer: number;
  gemini_api_key: string;
}

const Settings = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [config, setConfig] = useState<ConfigData>({
    vehicle_categories: [],
    safe_to_spend_buffer: 0,
    gemini_api_key: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [catsRes, configRes] = await Promise.all([
        categoriesAPI.getAll(),
        configAPI.getAll(),
      ]);
      setCategories(catsRes.data);

      // Parse config values
      const configs: ConfigData = {
        vehicle_categories: [],
        safe_to_spend_buffer: 0,
        gemini_api_key: '',
      };

      configRes.data.forEach((c: any) => {
        if (c.key === 'vehicle_categories' && c.value) {
          configs.vehicle_categories = JSON.parse(c.value);
        } else if (c.key === 'safe_to_spend_buffer' && c.value) {
          configs.safe_to_spend_buffer = parseFloat(c.value);
        } else if (c.key === 'gemini_api_key' && c.value) {
          configs.gemini_api_key = c.value;
        }
      });

      setConfig(configs);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Helper to update or create config
      const upsertConfig = async (key: string, data: any) => {
        try {
          await configAPI.getByKey(key);
          await configAPI.update(key, data);
        } catch (error) {
          await configAPI.create(data);
        }
      };

      // Update or create vehicle_categories config
      await upsertConfig('vehicle_categories', {
        key: 'vehicle_categories',
        value: JSON.stringify(config.vehicle_categories),
        value_type: 'json',
        description: 'List of category IDs considered as vehicle expenses',
        is_public: true,
      });

      // Update or create safe_to_spend_buffer config
      await upsertConfig('safe_to_spend_buffer', {
        key: 'safe_to_spend_buffer',
        value: config.safe_to_spend_buffer.toString(),
        value_type: 'number',
        description: 'Buffer amount for safe-to-spend calculation',
        is_public: true,
      });

      // Update or create gemini_api_key config
      await upsertConfig('gemini_api_key', {
        key: 'gemini_api_key',
        value: config.gemini_api_key,
        value_type: 'string',
        description: 'Google Gemini API Key for AI insights',
        is_public: false,
      });

      setToast({ message: 'Configuración guardada', type: 'success' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setToast({ message: 'Error al guardar configuración', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setConfig(prev => ({
      ...prev,
      vehicle_categories: prev.vehicle_categories.includes(categoryId)
        ? prev.vehicle_categories.filter(id => id !== categoryId)
        : [...prev.vehicle_categories, categoryId],
    }));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<{ timestamp: string | null; conflicts: number }>({ timestamp: null, conflicts: 0 });

  // Load sync metadata on mount
  useEffect(() => {
    const loadSyncInfo = async () => {
      try {
        const meta = await db.sync_metadata.get('last_sync_timestamp');
        const conflicts = await db.sync_metadata.get('conflicts_resolved');
        setLastSyncInfo({
          timestamp: meta?.value || null,
          conflicts: Number(conflicts?.value) || 0,
        });
      } catch { /* ignore */ }
    };
    loadSyncInfo();
  }, []);

  // --- Export: Dump all Dexie tables to JSON ---
  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const TABLES_TO_EXPORT = [
        'categories', 'accounts', 'transactions', 'transaction_splits',
        'credit_card_statements', 'debt_shares', 'ious', 'budgets',
        'goals', 'reminders', 'subscriptions'
      ];

      const backup: Record<string, any> = {
        _meta: {
          exported_at: new Date().toISOString(),
          version: 1,
          source: 'FinanceLocalFirstDB',
        },
      };

      for (const tableName of TABLES_TO_EXPORT) {
        backup[tableName] = await db.table(tableName).toArray();
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_finanzas_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast({ message: 'Backup exportado exitosamente', type: 'success' });
    } catch (e) {
      console.error('Error exporting backup:', e);
      setToast({ message: 'Error al exportar backup', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // --- Import: Restore Dexie from JSON backup ---
  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm(
      '⚠️ Esto reemplazará TODOS los datos locales con el contenido del backup. ' +
      'Los datos actuales se perderán. ¿Deseas continuar?'
    )) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup._meta || backup._meta.source !== 'FinanceLocalFirstDB') {
        setToast({ message: 'Archivo de backup inválido o no compatible', type: 'error' });
        return;
      }

      const TABLES_TO_IMPORT = [
        'categories', 'accounts', 'transactions', 'transaction_splits',
        'credit_card_statements', 'debt_shares', 'ious', 'budgets',
        'goals', 'reminders', 'subscriptions'
      ];

      await db.transaction('rw', db.tables, async () => {
        for (const tableName of TABLES_TO_IMPORT) {
          if (backup[tableName] && Array.isArray(backup[tableName])) {
            await db.table(tableName).clear();
            await db.table(tableName).bulkPut(backup[tableName]);
          }
        }
        // Reset sync timestamp to force full re-sync with backend
        await db.sync_metadata.put({ key: 'last_sync_timestamp', value: null });
      });

      // Trigger sync after import
      window.dispatchEvent(new Event('localMutation'));

      setToast({ message: `Backup restaurado: ${backup._meta.exported_at}. Sincronizando...`, type: 'success' });
      // Reload to reflect imported data
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      console.error('Error importing backup:', e);
      setToast({ message: 'Error al importar: archivo corrupto o formato inválido', type: 'error' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Export CSV: Current month transactions ---
  const handleExportCSV = async () => {
    try {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const allTxns = await db.table('transactions')
        .orderBy('date')
        .reverse()
        .filter((t: any) => !t.is_deleted && typeof t.date === 'string' && t.date.startsWith(yearMonth))
        .toArray();

      // Load categories for name resolution
      const allCats = await db.table('categories').toArray();
      const catMap = new Map(allCats.map((c: any) => [c.id, c.name]));

      const header = 'Fecha,Tipo,Categoría,Descripción,Monto,Método de Pago';
      const rows = allTxns.map((t: any) => {
        const date = t.date ? t.date.slice(0, 10) : '';
        const type = t.transaction_type === 'income' ? 'Ingreso' : 'Gasto';
        const category = catMap.get(t.category_id) || 'Sin Categoría';
        const desc = `"${(t.description || '').replace(/"/g, '""')}"`;
        const amount = formatMoney(t.amount);
        const method = t.payment_method || '';
        return `${date},${type},${category},${desc},${amount},${method}`;
      });

      const csv = [header, ...rows].join('\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transacciones_${yearMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast({ message: `${allTxns.length} transacciones exportadas a CSV`, type: 'success' });
    } catch (e) {
      console.error('Error exporting CSV:', e);
      setToast({ message: 'Error al exportar CSV', type: 'error' });
    }
  };

  // --- Logout: Clear session but KEEP Dexie data ---
  const handleLogout = () => {
    if (window.confirm(
      'Cerrar sesión eliminará tu token de acceso pero conservará todos los datos locales ' +
      'para uso offline. ¿Continuar?'
    )) {
      const tokenKey = getTokenKey();
      localStorage.removeItem('finance_base_url');
      localStorage.removeItem(tokenKey);
      window.location.reload();
    }
  };

  const handleUnlink = async () => {
    if (window.confirm("¿Estás seguro de que deseas desvincular este dispositivo? Todos los datos locales serán borrados permanentemente.")) {
      try {
        const tokenKey = getTokenKey();
        localStorage.removeItem('finance_base_url');
        localStorage.removeItem(tokenKey);
        await Promise.all(db.tables.map(table => table.clear()));
        window.location.reload();
      } catch (e) {
        console.error("Error al desvincular", e);
      }
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  return (
    <div className="w-full">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Configuración</h1>
        <p className="text-slate-300 text-sm lg:text-base">Configura las categorías de vehículo y el buffer de gasto seguro</p>
      </div>

      <div className="mb-8">
        <SyncManager />
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
        {/* Safe to Spend Buffer */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Buffer de Gasto Seguro</h2>
          <p className="text-slate-400 text-sm mb-4">
            Monto de seguridad que se resta del saldo disponible para calcular el gasto seguro.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-xs">
              <label className="block text-sm text-slate-300 mb-1">Monto ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={config.safe_to_spend_buffer}
                onChange={e => setConfig({ ...config, safe_to_spend_buffer: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Vehicle Categories */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Categorías de Vehículo</h2>
          <p className="text-slate-400 text-sm mb-4">
            Selecciona las categorías que deben considerarse como gastos de vehículo para el cálculo de métricas.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                  config.vehicle_categories.includes(category.id)
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                    : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:border-slate-500'
                }`}
              >
                {category.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                )}
                <span className="text-sm">{category.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Gemini API Key */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Gemini API Key</h2>
          <p className="text-slate-400 text-sm mb-4">
            API Key de Google Gemini para generar análisis financieros con IA. Se guardará de forma segura.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-md">
              <label className="block text-sm text-slate-300 mb-1">API Key</label>
              <input
                type="password"
                value={config.gemini_api_key}
                onChange={e => setConfig({ ...config, gemini_api_key: e.target.value })}
                placeholder="Ingresa tu Gemini API Key"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={handleUnlink}
            className="flex items-center px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm mr-auto transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Desvincular Dispositivo
          </button>
          
          <button
            onClick={fetchData}
            className="flex items-center px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Recargar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Backup & Recovery */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 mt-6">
        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          Respaldo y Recuperación
        </h2>
        <p className="text-slate-400 text-sm mb-6">Exporta o restaura todos tus datos financieros desde un archivo local.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Export JSON */}
          <button
            onClick={handleExportBackup}
            disabled={exporting}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors text-emerald-400 disabled:opacity-50"
          >
            <Download className="w-8 h-8" />
            <span className="text-sm font-medium">{exporting ? 'Exportando...' : 'Exportar Todo (JSON)'}</span>
            <span className="text-xs text-slate-500">Dump completo de todas las tablas</span>
          </button>

          {/* Import JSON */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-amber-400 disabled:opacity-50"
          >
            <Upload className="w-8 h-8" />
            <span className="text-sm font-medium">{importing ? 'Importando...' : 'Importar Backup (JSON)'}</span>
            <span className="text-xs text-slate-500">Restaura desde archivo .json</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-blue-400"
          >
            <FileSpreadsheet className="w-8 h-8" />
            <span className="text-sm font-medium">Exportar CSV (Mes Actual)</span>
            <span className="text-xs text-slate-500">Transacciones en formato hoja de cálculo</span>
          </button>
        </div>
      </div>

      {/* Sync Integrity Log */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 mt-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" />
          Estado de Sincronización
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50">
            <span className="text-sm text-slate-400">Última sincronización exitosa</span>
            <span className="text-sm font-mono text-slate-200">
              {lastSyncInfo.timestamp
                ? new Date(lastSyncInfo.timestamp).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
                : 'Nunca'
              }
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50">
            <span className="text-sm text-slate-400">Conflictos resueltos (LWW)</span>
            <span className="text-sm font-mono text-slate-200">{lastSyncInfo.conflicts}</span>
          </div>
        </div>
      </div>

      {/* Session Management */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 mt-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          Sesión
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
            <span className="text-xs text-slate-500 ml-1">(conserva datos locales)</span>
          </button>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Settings;
