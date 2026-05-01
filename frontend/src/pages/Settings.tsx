import { useEffect, useState, useRef } from 'react';
import { configAPI, categoriesAPI, snapshotsAPI, getTokenKey } from '../services/api';
import { Save, RefreshCw, LogOut, Download, Upload, FileSpreadsheet, Shield, AlertTriangle, HardDrive, Database, Trash2, AlertCircle, Cloud } from 'lucide-react';
import Toast from '../components/Toast';
import { db } from '../db/db';
import { formatMoney } from '../utils/money';
import { checkStorageQuota } from '../utils/storage';
import { validateCacheIntegrity } from '../services/AICategorizationService';
import type { Category } from '../types';

interface ConfigData {
  vehicle_categories: string[];
  safe_to_spend_buffer: number;
  gemini_api_key: string;
}

interface GoogleDriveCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
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

  // FASE 6: Diagnostics state
  const [storageUsage, setStorageUsage] = useState<{ usagePercent: number; status: 'healthy' | 'warning' | 'critical' }>({ usagePercent: 0, status: 'healthy' });
  const [aiCacheCount, setAiCacheCount] = useState(0);
  const [staleSnapshotsCount, setStaleSnapshotsCount] = useState(0);
  const [reconciling, setReconciling] = useState(false);
  const [phoenixBackup, setPhoenixBackup] = useState<{ timestamp: string; data: any } | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // FASE 3.5: Google Drive credentials state
  const [driveCredentials, setDriveCredentials] = useState<GoogleDriveCredentials>({
    client_id: '',
    client_secret: '',
    refresh_token: ''
  });
  const [savingDriveCredentials, setSavingDriveCredentials] = useState(false);

  // FASE 6: Load diagnostics data when diagnostics section is shown
  useEffect(() => {
    if (showDiagnostics) {
      loadDiagnostics();
    }
  }, [showDiagnostics]);

  // FASE 6: Check for Phoenix emergency backup on mount
  useEffect(() => {
    const checkPhoenixBackup = () => {
      try {
        const backupStr = localStorage.getItem('phoenix_emergency_backup');
        if (backupStr) {
          const backup = JSON.parse(backupStr);
          setPhoenixBackup({ timestamp: backup.timestamp, data: backup });
        }
      } catch (error) {
        console.error('Error checking Phoenix backup:', error);
      }
    };
    checkPhoenixBackup();
  }, []);

  const loadDiagnostics = async () => {
    try {
      // Check storage quota
      const storage = await checkStorageQuota();
      setStorageUsage({ usagePercent: storage.usagePercent * 100, status: storage.status });

      // Count ai_cache entries
      // @ts-ignore
      const cacheCount = await db.ai_cache.count();
      setAiCacheCount(cacheCount);

      // Count stale snapshots
      // @ts-ignore
      const staleCount = await db.net_worth_snapshots.where('is_stale').equals(true).count();
      setStaleSnapshotsCount(staleCount);

      // FASE 7: Validate AI cache integrity (cross-reference with categories)
      const integrityResult = await validateCacheIntegrity();
      if (integrityResult.deleted > 0) {
        setToast({ 
          message: `Integridad de caché: ${integrityResult.deleted} entradas huérfanas eliminadas`, 
          type: 'success' 
        });
        // Update cache count after cleanup
        setAiCacheCount(integrityResult.checked - integrityResult.deleted);
      }
    } catch (error) {
      console.error('Error loading diagnostics:', error);
    }
  };

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

  // FASE 3.5: Load Google Drive credentials
  const loadDriveCredentials = async () => {
    try {
      const response = await fetch('/api/config/drive');
      if (response.ok) {
        const data = await response.json();
        setDriveCredentials(data);
      }
    } catch (error) {
      console.error('Error loading Google Drive credentials:', error);
    }
  };

  // FASE 3.5: Save Google Drive credentials
  const handleSaveDriveCredentials = async () => {
    setSavingDriveCredentials(true);
    try {
      const response = await fetch('/api/config/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driveCredentials),
      });

      if (response.ok) {
        setToast({ message: 'Credenciales de Google Drive guardadas exitosamente', type: 'success' });
      } else {
        setToast({ message: 'Error al guardar credenciales de Google Drive', type: 'error' });
      }
    } catch (error) {
      console.error('Error saving Google Drive credentials:', error);
      setToast({ message: 'Error al guardar credenciales de Google Drive', type: 'error' });
    } finally {
      setSavingDriveCredentials(false);
    }
  };

  useEffect(() => {
    fetchData();
    loadDriveCredentials();
  }, []);

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
  // FASE 6: Add progress bar and spinner for import
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
    setImportProgress({ current: 0, total: 0 });
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

      // Calculate total records for progress
      let totalRecords = 0;
      for (const tableName of TABLES_TO_IMPORT) {
        if (backup[tableName] && Array.isArray(backup[tableName])) {
          totalRecords += backup[tableName].length;
        }
      }
      setImportProgress({ current: 0, total: totalRecords });

      let currentRecord = 0;
      await db.transaction('rw', db.tables, async () => {
        for (const tableName of TABLES_TO_IMPORT) {
          if (backup[tableName] && Array.isArray(backup[tableName])) {
            await db.table(tableName).clear();
            await db.table(tableName).bulkPut(backup[tableName]);
            currentRecord += backup[tableName].length;
            setImportProgress({ current: currentRecord, total: totalRecords });
          }
        }
      });

      setToast({ message: `Backup restaurado: ${backup._meta.exported_at}`, type: 'success' });
      // Reload to reflect imported data
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      console.error('Error importing backup:', e);
      setToast({ message: 'Error al importar: archivo corrupto o formato inválido', type: 'error' });
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Export CSV: Current month transactions ---
  // FASE 3: Use StreamedExporter for large datasets (>10,000 records)
  const handleExportCSV = async () => {
    try {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const allTxns = await db.table('transactions')
        .orderBy('date')
        .reverse()
        .filter((t: any) => !t.is_deleted && typeof t.date === 'string' && t.date.startsWith(yearMonth))
        .toArray();

      // FASE 3: Use StreamedExporter for large datasets to avoid blocking main thread
      const { StreamedExporter, streamedExporter } = await import('../utils/StreamedExporter');
      
      if (allTxns.length > 10000) {
        console.log(`[FASE-3] Large export detected (${allTxns.length} records), using StreamedExporter`);
        const blob = await streamedExporter.exportTransactions();
        StreamedExporter.downloadBlob(blob, `transactions_${yearMonth}.csv`);
      } else {
        // Small dataset: use direct export with formatting (faster for small files)
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
      }

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

  // FASE 6: Purge AI cache
  const handlePurgeCache = async () => {
    if (!window.confirm("¿Estás seguro de purgar la caché de IA? Esto forzará recálculos de categorización en próximas sincronizaciones.")) {
      return;
    }

    try {
      // @ts-ignore
      await db.ai_cache.clear();
      setAiCacheCount(0);
      setToast({ message: 'Caché de IA purgada exitosamente', type: 'success' });
    } catch (error) {
      console.error('Error purging AI cache:', error);
      setToast({ message: 'Error al purgar caché de IA', type: 'error' });
    }
  };

  // FASE 6: Manual snapshot reconciliation
  const handleReconcileSnapshots = async () => {
    if (!window.confirm("¿Deseas ejecutar reconciliación manual de snapshots? Esto puede tomar varios segundos.")) {
      return;
    }

    setReconciling(true);
    try {
      await snapshotsAPI.reconcile();
      setStaleSnapshotsCount(0);
      setToast({ message: 'Reconciliación completada exitosamente', type: 'success' });
      // Reload diagnostics
      await loadDiagnostics();
    } catch (error) {
      console.error('Error reconciling snapshots:', error);
      setToast({ message: 'Error al reconciliar snapshots', type: 'error' });
    } finally {
      setReconciling(false);
    }
  };

  // FASE 6: Download Phoenix backup JSON
  const handleDownloadPhoenixBackup = () => {
    if (!phoenixBackup) return;

    try {
      const blob = new Blob([JSON.stringify(phoenixBackup.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phoenix_emergency_backup_${phoenixBackup.timestamp.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ message: 'Backup de Phoenix descargado', type: 'success' });
    } catch (error) {
      console.error('Error downloading Phoenix backup:', error);
      setToast({ message: 'Error al descargar backup', type: 'error' });
    }
  };

  // FASE 6: Clear Phoenix alert
  const handleClearPhoenixAlert = () => {
    if (!window.confirm("¿Estás seguro de limpiar la alerta de backup de emergencia? Esto eliminará el respaldo de localStorage.")) {
      return;
    }

    try {
      localStorage.removeItem('phoenix_emergency_backup');
      setPhoenixBackup(null);
      setToast({ message: 'Alerta de Phoenix limpiada', type: 'success' });
    } catch (error) {
      console.error('Error clearing Phoenix alert:', error);
      setToast({ message: 'Error al limpiar alerta', type: 'error' });
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
            className="flex flex-col items-center gap-3 p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-amber-400 disabled:opacity-50 relative"
          >
            {importing ? (
              <RefreshCw className="w-8 h-8 animate-spin" />
            ) : (
              <Upload className="w-8 h-8" />
            )}
            <span className="text-sm font-medium">{importing ? 'Importando...' : 'Importar Backup (JSON)'}</span>
            <span className="text-xs text-slate-500">Restaura desde archivo .json</span>
            {importing && importProgress.total > 0 && (
              <div className="w-full mt-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Progreso</span>
                  <span>{importProgress.current} / {importProgress.total}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1">
                  <div
                    className="h-1 rounded-full bg-amber-500 transition-all"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
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

      {/* FASE 3.5: Google Drive Configuration */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 mt-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Cloud className="w-5 h-5 text-blue-400" />
          Google Drive Backup
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Configura las credenciales de OAuth para respaldos automáticos en Google Drive.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Client ID</label>
            <input
              type="text"
              value={driveCredentials.client_id}
              onChange={(e) => setDriveCredentials({ ...driveCredentials, client_id: e.target.value })}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder=".apps.googleusercontent.com"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Client Secret</label>
            <input
              type="password"
              value={driveCredentials.client_secret}
              onChange={(e) => setDriveCredentials({ ...driveCredentials, client_secret: e.target.value })}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="GOCSPX-..."
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Refresh Token</label>
            <input
              type="password"
              value={driveCredentials.refresh_token}
              onChange={(e) => setDriveCredentials({ ...driveCredentials, refresh_token: e.target.value })}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="//..."
            />
          </div>
          <button
            onClick={handleSaveDriveCredentials}
            disabled={savingDriveCredentials}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors text-sm disabled:opacity-50"
          >
            {savingDriveCredentials ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Guardar Credenciales
              </>
            )}
          </button>
        </div>
      </div>

      {/* FASE 6: Phoenix Emergency Backup Alert */}
      {phoenixBackup && (
        <div className="bg-red-900/20 backdrop-blur-xl rounded-2xl border border-red-500/50 p-6 mt-6">
          <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            Backup de Emergencia Detectado
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Un backup de Phoenix fue creado el {new Date(phoenixBackup.timestamp).toLocaleString('es-MX')} debido a una corrupción de esquema.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDownloadPhoenixBackup}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 text-sm"
            >
              <Download className="w-4 h-4" />
              Descargar Backup JSON
            </button>
            <button
              onClick={handleClearPhoenixAlert}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Limpiar Alerta
            </button>
          </div>
        </div>
      )}

      {/* FASE 6: Data Diagnostics */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-400" />
            Diagnóstico de Datos
          </h2>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="text-sm text-purple-400 hover:text-purple-300"
          >
            {showDiagnostics ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>

        {showDiagnostics && (
          <div className="space-y-6">
            {/* Storage Guardian */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <HardDrive className="w-4 h-4" />
                Uso de Disco (Storage Guardian)
              </h3>
              <div className="mb-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Uso actual</span>
                  <span className={storageUsage.status === 'critical' ? 'text-red-400' : storageUsage.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}>
                    {storageUsage.usagePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      storageUsage.status === 'critical' ? 'bg-red-500' : storageUsage.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(storageUsage.usagePercent, 100)}%` }}
                  />
                </div>
              </div>
              {storageUsage.status === 'warning' && (
                <p className="text-xs text-amber-400">⚠️ Almacenamiento bajo: considera limpiar datos antiguos</p>
              )}
              {storageUsage.status === 'critical' && (
                <p className="text-xs text-red-400">🚨 Almacenamiento crítico: las importaciones masivas están bloqueadas</p>
              )}
            </div>

            {/* AI Cache */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50">
              <div>
                <h3 className="text-sm font-medium text-slate-300">Caché de IA</h3>
                <p className="text-xs text-slate-500">{aiCacheCount} entradas almacenadas</p>
              </div>
              <button
                onClick={handlePurgeCache}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs"
              >
                <Trash2 className="w-4 h-4" />
                Purgar Caché
              </button>
            </div>

            {/* Stale Snapshots */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50">
              <div>
                <h3 className="text-sm font-medium text-slate-300">Snapshots Stale</h3>
                <p className="text-xs text-slate-500">{staleSnapshotsCount} snapshots marcados como obsoletos</p>
              </div>
              <button
                onClick={handleReconcileSnapshots}
                disabled={reconciling}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 text-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${reconciling ? 'animate-spin' : ''}`} />
                Reconciliación Manual
              </button>
            </div>
          </div>
        )}
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
