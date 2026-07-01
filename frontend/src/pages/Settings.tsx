import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  configAPI, 
  categoriesAPI, 
  driveConfigAPI, 
  backupAPI,
  aiAPI
} from '../services/api';
import { 
  Save, 
  RefreshCw, 
  FileSpreadsheet, 
  AlertTriangle,
  Cloud, 
  CheckCircle, 
  Download, 
  Database, 
  Cpu, 
  Settings as SettingsIcon,
  ShieldAlert,
  ChevronRight,
  Lock,
  Sparkles
} from 'lucide-react';
import DeviceManager from '../components/Settings/DeviceManager';
import Toast from '../components/Toast';
import type { Category, BackupFile } from '../types';
import type { AxiosError } from 'axios';

interface ConfigItem {
  key: string;
  value: string;
}

interface ConfigData {
  vehicle_categories: string[];
  safe_to_spend_buffer: number;
  gemini_api_key: string;
  ai_persona: string;
}

interface GoogleDriveCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

interface GoogleDriveStatus {
  is_configured: boolean;
  has_client_id: boolean;
  has_client_secret: boolean;
  has_refresh_token: boolean;
}

type SettingsTab = 'general' | 'ai' | 'labs' | 'cloud' | 'security';

const Settings = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [config, setConfig] = useState<ConfigData>({
    vehicle_categories: [],
    safe_to_spend_buffer: 0,
    gemini_api_key: '',
    ai_persona: 'professional',
  });

  const [hasDriveCredentials, setHasDriveCredentials] = useState(false);
  const [driveCredentials, setDriveCredentials] = useState<GoogleDriveCredentials>({
    client_id: '',
    client_secret: '',
    refresh_token: ''
  });
  const [savingDriveCredentials, setSavingDriveCredentials] = useState(false);

  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingDrive, setTestingDrive] = useState(false);
  const [authorizingDrive, setAuthorizingDrive] = useState(false);

  const tabs = [
    { id: 'general', label: 'General', icon: SettingsIcon, color: 'text-blue-400' },
    { id: 'ai', label: 'Núcleo API', icon: Cpu, color: 'text-indigo-400' },
    { id: 'labs', label: 'AI Labs', icon: Sparkles, color: 'text-amber-400' },
    { id: 'cloud', label: 'Respaldo Cloud', icon: Cloud, color: 'text-emerald-400' },
    { id: 'security', label: 'Seguridad Acceso', icon: Lock, color: 'text-rose-400' },
  ];

  const fetchData = useCallback(async () => {
    try {
      const [catsRes, configRes] = await Promise.all([
        categoriesAPI.getAll(),
        configAPI.getAll(),
      ]);
      setCategories(catsRes.data);

      const configs: ConfigData = {
        vehicle_categories: [],
        safe_to_spend_buffer: 0,
        gemini_api_key: '',
        ai_persona: 'professional',
      };

      configRes.data.forEach((c: ConfigItem) => {
        if (c.key === 'vehicle_categories' && c.value) {
          configs.vehicle_categories = JSON.parse(c.value);
        } else if (c.key === 'safe_to_spend_buffer' && c.value) {
          configs.safe_to_spend_buffer = parseFloat(c.value);
        } else if (c.key === 'gemini_api_key' && c.value) {
          configs.gemini_api_key = c.value;
        } else if (c.key === 'ai_persona' && c.value) {
          configs.ai_persona = c.value;
        }
      });

      setConfig(configs);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDriveCredentials = useCallback(async () => {
    try {
      const response = await driveConfigAPI.getStatus();
      const data = response.data as GoogleDriveStatus;
      if (data) {
        setHasDriveCredentials(data.is_configured);
      }
    } catch (error) {
      console.error('Error loading Google Drive credentials:', error);
    }
  }, []);

  const handleLoadBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const res = await backupAPI.listBackups();
      if (res.data.success) {
        setBackups(res.data.backups);
      }
    } catch (e: unknown) {
      console.error('Error loading backups:', e);
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchData();
    loadDriveCredentials();
    handleLoadBackups();
  }, [fetchData, loadDriveCredentials, handleLoadBackups]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const upsertConfig = async (key: string, data: unknown) => {
        try {
          await configAPI.getByKey(key);
          await configAPI.update(key, data);
        } catch (_error) {
          await configAPI.create(data);
        }
      };

      await upsertConfig('vehicle_categories', {
        key: 'vehicle_categories',
        value: JSON.stringify(config.vehicle_categories),
        value_type: 'json',
        description: 'List of category IDs considered as vehicle expenses',
        is_public: true,
      });

      await upsertConfig('safe_to_spend_buffer', {
        key: 'safe_to_spend_buffer',
        value: config.safe_to_spend_buffer.toString(),
        value_type: 'number',
        description: 'Buffer amount for safe-to-spend calculation',
        is_public: true,
      });

      if (config.gemini_api_key && config.gemini_api_key !== '********') {
        await upsertConfig('gemini_api_key', {
          key: 'gemini_api_key',
          value: config.gemini_api_key,
          value_type: 'string',
          description: 'Google Gemini API Key for AI insights',
          is_public: false,
        });
      }

      await upsertConfig('ai_persona', {
        key: 'ai_persona',
        value: config.ai_persona,
        value_type: 'string',
        description: 'Persona/Tone for the AI Assistant (professional vs roast)',
        is_public: true,
      });

      setToast({ message: 'Configuración guardada exitosamente', type: 'success' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setToast({ message: 'Error al guardar configuración', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickSave = async (key: string, value: unknown, type: 'string' | 'json' | 'number') => {
    try {
      const data = {
        key,
        value: type === 'json' ? JSON.stringify(value) : value.toString(),
        value_type: type,
        description: `Auto-updated ${key}`,
        is_public: true
      };
      
      try {
        await configAPI.getByKey(key);
        await configAPI.update(key, data);
      } catch {
        await configAPI.create(data);
      }
      setToast({ message: 'Cambio guardado automáticamente', type: 'success' });
    } catch (error) {
      console.error(`Error auto-saving ${key}:`, error);
      setToast({ message: 'Error al guardar automáticamente', type: 'error' });
    }
  };

  const toggleCategory = (categoryId: string) => {
    const newList = config.vehicle_categories.includes(categoryId)
      ? config.vehicle_categories.filter(id => id !== categoryId)
      : [...config.vehicle_categories, categoryId];
      
    setConfig(prev => ({
      ...prev,
      vehicle_categories: newList,
    }));
    
    handleQuickSave('vehicle_categories', newList, 'json');
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const { StreamedExporter, streamedExporter } = await import('../utils/StreamedExporter');
      const blob = await streamedExporter.exportTransactions();
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      StreamedExporter.downloadBlob(blob, `transactions_${yearMonth}.csv`);
      setToast({ message: 'Transacciones exportadas a CSV', type: 'success' });
    } catch (e) {
      console.error('Error exporting CSV:', e);
      setToast({ message: 'Error al exportar CSV', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const handleSaveDriveCredentials = async () => {
    setSavingDriveCredentials(true);
    try {
      await driveConfigAPI.setCredentials(driveCredentials);
      setToast({ message: 'Credenciales de Google Drive vinculadas', type: 'success' });
      await loadDriveCredentials();
    } catch (error) {
      console.error('Error saving Google Drive credentials:', error);
      setToast({ message: 'Error al vincular Google Drive', type: 'error' });
    } finally {
      setSavingDriveCredentials(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await backupAPI.createManualBackup();
      if (res.data.success) {
        setToast({ message: res.data.message, type: 'success' });
        await handleLoadBackups();
      } else {
        setToast({ message: res.data.message, type: 'warning' });
      }
    } catch (e: unknown) {
      console.error('Error creating backup:', e);
      setToast({ message: 'Error al crear backup', type: 'error' });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleAuthorizeDrive = async () => {
    setAuthorizingDrive(true);
    try {
      const res = await driveConfigAPI.getAuthUrl();
      if (res.data.auth_url) {
        // Open authorization URL in a new window
        window.open(res.data.auth_url, '_blank', 'width=600,height=600');
        setToast({ message: 'Se ha abierto la ventana de autorización de Google', type: 'warning' });
      }
    } catch (error: unknown) {
      console.error('Error getting auth URL:', error);
      const axiosErr = error as AxiosError<{ detail: string }>;
      const msg = axiosErr.response?.data?.detail || 'Error al iniciar autorización';
      setToast({ message: msg, type: 'error' });
    } finally {
      setAuthorizingDrive(false);
    }
  };



  const handleRestoreBackup = async (backupId: string) => {
    if (!window.confirm('¿Estás seguro de que quieres restaurar este backup? El servidor necesitará reiniciarse.')) {
      return;
    }
    try {
      const res = await backupAPI.restoreBackup(backupId);
      if (res.data.success) {
        setToast({ message: res.data.message, type: 'success' });
      } else {
        setToast({ message: res.data.message, type: 'warning' });
      }
    } catch (e: unknown) {
      console.error('Error restoring backup:', e);
      setToast({ message: 'Error al restaurar backup', type: 'error' });
    }
  };

  const personas = [
    { id: 'professional', label: 'Analista Senior', desc: 'Preciso, educado y directo al punto.', icon: '👔' },
    { id: 'roast', label: 'Modo Roast', desc: 'Sin piedad. Te humillará por cada café que compres fuera.', icon: '🔥' },
    { id: 'gamified', label: 'RPG Master', desc: 'Convierte tus finanzas en una misión de nivel legendario.', icon: '⚔️' },
    { id: 'coach', label: 'Motivador Personal', desc: '¡Vamos! Un pequeño ahorro hoy es una victoria mañana.', icon: '📣' },
    { id: 'minimalist', label: 'Minimalista', desc: 'Elegancia directa: Hecho. Impacto. Acción.', icon: '◼️' },
    { id: 'professor', label: 'Profesor', desc: 'Conceptos económicos aplicados a tu propia billetera.', icon: '🎓' },
    { id: 'sabio', label: 'Maestro Zen', desc: 'Encuentra el equilibrio entre el gasto y la paz interior.', icon: '🧘' },
    { id: 'detective', label: 'Forense Financiero', desc: 'Seguirá el rastro de cada centavo perdido.', icon: '🔍' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-white">
        <RefreshCw className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Iniciando Centro de Mando...</p>
      </div>
    );
  }

  return (
    <div className="w-full relative min-h-screen pb-20">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[10%] -left-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="mb-10">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold tracking-widest uppercase mb-1">
              <div className="w-8 h-[1px] bg-indigo-500/50"></div>
              <span>Panel de Control</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
              Configuración del <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Sistema</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium">Personaliza el comportamiento y seguridad de Tabula Rasa</p>
          </motion.div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="sticky top-8 space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm ${
                    activeTab === tab.id
                      ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                      : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? tab.color : ''}`} />
                  <span>{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div layoutId="activeTabIndicator" className="ml-auto">
                      <ChevronRight className="w-4 h-4 text-white/40" />
                    </motion.div>
                  )}
                </button>
              ))}

              <div className="pt-6">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-2xl hover:shadow-lg hover:shadow-blue-500/20 transition-all font-black uppercase tracking-widest text-xs disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{saving ? 'Guardando...' : 'Aplicar Cambios'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="bg-slate-800/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 p-8 lg:p-10"
              >
                {activeTab === 'general' && (
                  <div className="space-y-10">
                    <section>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                          <Database className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Exportar Transacciones</h2>
                          <p className="text-slate-400 text-sm">Descarga tu historial financiero completo</p>
                        </div>
                      </div>

                      <div className="bg-black/20 rounded-3xl p-6 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                            <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Reporte CSV</p>
                            <p className="text-xs text-slate-500">Formato compatible con Excel y Sheets</p>
                          </div>
                        </div>
                        <button
                          onClick={handleExportCSV}
                          disabled={exporting}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-900/20"
                        >
                          {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          Descargar
                        </button>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                          <ShieldAlert className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Fondo de Seguridad</h2>
                          <p className="text-slate-400 text-sm">Reserva una parte de tu capital para emergencias</p>
                        </div>
                      </div>
                      
                      <div className="bg-black/20 rounded-3xl p-6 border border-white/5">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <label className="block text-xs font-black text-white/30 uppercase tracking-widest mb-2">Monto de Buffer ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={config.safe_to_spend_buffer}
                              onChange={e => setConfig({ ...config, safe_to_spend_buffer: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500/50 transition-all"
                            />
                          </div>
                          <div className="w-1/2 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                            <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Impacto en Liquidez</p>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              Este monto se restará de tu "Gasto Seguro" total para protegerte de imprevistos.
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                          <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Categorías de Vehículo</h2>
                          <p className="text-slate-400 text-sm">Categorías vinculadas al análisis de movilidad</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {categories
                          .sort((a, b) => a.name.length - b.name.length)
                          .map((category) => (
                          <button
                            key={category.id}
                            onClick={() => toggleCategory(category.id)}
                            className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${
                              config.vehicle_categories.includes(category.id)
                                ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                                : 'bg-black/20 border-white/5 text-slate-500 hover:border-white/10'
                            }`}
                          >
                            <span className="text-xs font-bold text-center leading-tight">{category.name}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'ai' && (
                  <div className="space-y-10">
                    <section>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                          <Lock className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Seguridad API</h2>
                          <p className="text-slate-400 text-sm">Conexión con el cerebro de Google Gemini</p>
                        </div>
                      </div>

                      <div className="bg-black/20 rounded-3xl p-6 border border-white/5">
                        <label className="block text-xs font-black text-white/30 uppercase tracking-widest mb-3">Gemini API Key</label>
                        <div className="relative">
                          <input
                            type="password"
                            value={config.gemini_api_key}
                            onChange={e => setConfig({ ...config, gemini_api_key: e.target.value })}
                            placeholder="Ingresa tu API Key de Gemini..."
                            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-4 text-white font-mono text-sm focus:outline-none focus:border-purple-500/50 transition-all"
                          />
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                            <Cloud className="w-5 h-5 text-indigo-400" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-white">Credenciales OAuth</h2>
                            <p className="text-slate-400 text-sm">Vínculo con Google Drive para respaldos</p>
                          </div>
                        </div>
                        {hasDriveCredentials && (
                          <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2">
                            <CheckCircle className="w-3 h-3" />
                            Sincronizado
                          </div>
                        )}
                      </div>

                      <div className="bg-black/20 rounded-3xl p-8 border border-white/5 space-y-5">
                        <div className="grid grid-cols-1 gap-5">
                          <div>
                            <label className="block text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Client ID</label>
                            <input
                              type="text"
                              value={driveCredentials.client_id}
                              onChange={(e) => setDriveCredentials({ ...driveCredentials, client_id: e.target.value })}
                              className="w-full bg-slate-900/50 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all"
                              placeholder=".apps.googleusercontent.com"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                              <label className="block text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Client Secret</label>
                              <input
                                type="password"
                                value={driveCredentials.client_secret}
                                onChange={(e) => setDriveCredentials({ ...driveCredentials, client_secret: e.target.value })}
                                className="w-full bg-slate-900/50 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all"
                                placeholder="GOCSPX-..."
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Refresh Token</label>
                              <input
                                type="password"
                                value={driveCredentials.refresh_token}
                                onChange={(e) => setDriveCredentials({ ...driveCredentials, refresh_token: e.target.value })}
                                className="w-full bg-slate-900/50 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all"
                                placeholder="//..."
                              />
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-4">
                          <button
                            onClick={handleSaveDriveCredentials}
                            disabled={savingDriveCredentials}
                            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            {savingDriveCredentials ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-blue-400" />}
                            <span>Guardar Credenciales</span>
                          </button>

                          <button
                            onClick={handleAuthorizeDrive}
                            disabled={authorizingDrive || (!driveCredentials.client_id && !hasDriveCredentials)}
                            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-900/40 disabled:opacity-30"
                          >
                            {authorizingDrive ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            <span>Autorizar con Google</span>
                          </button>
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                          <RefreshCw className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Pruebas de Conectividad</h2>
                          <p className="text-slate-400 text-sm">Verifica los canales de comunicación externos</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-black/20 rounded-3xl p-6 border border-white/5">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-purple-400" />
                              <span className="text-sm font-bold text-white">Google Gemini</span>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              setTestingGemini(true);
                              try {
                                const res = await aiAPI.testComponent('sentinel');
                                if (res.data.status === 'success') {
                                  setToast({ message: 'Conexión con Gemini exitosa', type: 'success' });
                                } else {
                                  setToast({ message: 'Error de conexión: ' + res.data.message, type: 'error' });
                                }
                              } catch (_e) {
                                setToast({ message: 'Error de servidor al probar conexión', type: 'error' });
                              } finally {
                                setTestingGemini(false);
                              }
                            }}
                            disabled={testingGemini}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-slate-300 transition-all border border-white/5 flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {testingGemini ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-purple-400" />
                            ) : (
                              <Sparkles className="w-3 h-3 text-purple-400" />
                            )}
                            {testingGemini ? 'Verificando...' : 'Verificar API Key'}
                          </button>
                        </div>

                        <div className="bg-black/20 rounded-3xl p-6 border border-white/5">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Cloud className="w-4 h-4 text-blue-400" />
                              <span className="text-sm font-bold text-white">Google Drive</span>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              setTestingDrive(true);
                              try {
                                const res = await driveConfigAPI.test();
                                if (res.data.success) {
                                  setToast({ message: 'OAuth2 funcionando correctamente', type: 'success' });
                                } else {
                                  setToast({ message: 'Error: ' + res.data.message, type: 'error' });
                                }
                              } catch (e: unknown) {
                                const axiosErr = e as AxiosError<{ detail: string }>;
                                const msg = axiosErr.response?.data?.detail || 'Error de servidor al probar OAuth2';
                                setToast({ message: msg, type: 'error' });
                              } finally {
                                setTestingDrive(false);
                              }
                            }}
                            disabled={testingDrive}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-slate-300 transition-all border border-white/5 flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {testingDrive ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                            ) : (
                              <Cloud className="w-3 h-3 text-blue-400" />
                            )}
                            {testingDrive ? 'Verificando...' : 'Verificar OAuth2'}
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'labs' && (
                  <div className="space-y-10">
                    <section>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                          <Cpu className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Personalidad del Asistente</h2>
                          <p className="text-slate-400 text-sm">Define cómo interactúa la IA contigo</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {personas.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setConfig({ ...config, ai_persona: p.id });
                              handleQuickSave('ai_persona', p.id, 'string');
                            }}
                            className={`flex items-start gap-4 p-5 rounded-3xl border transition-all text-left group ${
                              config.ai_persona === p.id
                                ? 'bg-purple-500/10 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.1)]'
                                : 'bg-black/20 border-white/5 hover:border-white/10'
                            }`}
                          >
                            <span className="text-3xl transition-transform group-hover:scale-110 duration-300">{p.icon}</span>
                            <div>
                              <h3 className={`font-bold text-sm mb-1 ${config.ai_persona === p.id ? 'text-purple-400' : 'text-white'}`}>
                                {p.label}
                              </h3>
                              <p className="text-xs text-slate-500 leading-normal">{p.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                          <Sparkles className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Diagnóstico de Componentes</h2>
                          <p className="text-slate-400 text-sm">Prueba el razonamiento de los motores de IA</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {[
                          { id: 'sentinel', name: 'Sentinel Agent', desc: 'Orquestador de salud financiera y alertas.' },
                          { id: 'anomaly', name: 'Anomaly Scanner', desc: 'Detección de gastos atípicos y fugas.' },
                          { id: 'fiscal', name: 'Fiscal Intelligence', desc: 'Cálculo de impuestos y proyecciones SRI.' },
                          { id: 'whatif', name: 'What-If Simulator', desc: 'Simulación de escenarios y proyecciones de ahorro.' },
                          { id: 'audio', name: 'Multimodal Engine', desc: 'Procesamiento de notas de voz y documentos (OCR).' },
                          { id: 'categorization', name: 'Semantic Brain', desc: 'Categorización inteligente de transacciones.' }
                        ].map((comp) => (
                          <div key={comp.id} className="group bg-black/20 rounded-3xl p-6 border border-white/5 flex items-center justify-between hover:border-white/10 transition-all">
                            <div className="flex-1">
                              <h3 className="font-bold text-white text-sm group-hover:text-amber-400 transition-all">{comp.name}</h3>
                              <p className="text-xs text-slate-500">{comp.desc}</p>
                            </div>
                            <button
                              onClick={async (e) => {
                                const btn = e.currentTarget;
                                btn.disabled = true;
                                try {
                                  const { aiAPI } = await import('../services/api');
                                  const res = await aiAPI.testComponent(comp.id);
                                  if (res.data.status === 'success') {
                                    setToast({ message: `${comp.name}: OK`, type: 'success' });
                                  } else {
                                    setToast({ message: `${comp.name}: Error`, type: 'error' });
                                  }
                                } catch (_err) {
                                  setToast({ message: 'Error de servidor', type: 'error' });
                                } finally {
                                  btn.disabled = false;
                                }
                              }}
                              className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase rounded-xl border border-indigo-500/20 transition-all"
                            >
                              Test
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'cloud' && (
                  <div className="space-y-10">
                    <section>
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                            <Cloud className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-white">Backups en la Nube</h2>
                            <p className="text-slate-400 text-sm">Instantáneas de seguridad de tu base de datos</p>
                          </div>
                        </div>
                        <button
                          onClick={handleCreateBackup}
                          disabled={creatingBackup}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                        >
                          {creatingBackup ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          Nuevo Backup
                        </button>
                      </div>

                      <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                        {loadingBackups ? (
                          <div className="p-10 text-center text-slate-500 text-sm animate-pulse">Consultando historial...</div>
                        ) : backups.length > 0 ? (
                          backups.map((backup: BackupFile) => (
                            <div key={backup.id} className="group flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-emerald-500/10 transition-all">
                                  <Database className="w-5 h-5 text-slate-500 group-hover:text-emerald-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-white/80 group-hover:text-white transition-all">{backup.name}</p>
                                  <p className="text-[10px] text-slate-500 font-medium">
                                    {new Date(backup.createdTime).toLocaleString('es-EC')}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleRestoreBackup(backup.id)}
                                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 opacity-0 group-hover:opacity-100"
                              >
                                Restaurar
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="p-10 text-center text-slate-500 text-sm bg-black/10 rounded-3xl border border-dashed border-white/5">
                            No se han encontrado backups.
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="pt-10 border-t border-red-500/10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                          <AlertTriangle className="w-5 h-5 text-rose-500" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-rose-500">Zona de Peligro</h2>
                          <p className="text-slate-400 text-sm">Acciones críticas e irreversibles</p>
                        </div>
                      </div>

                      <div className="bg-rose-500/5 rounded-[2rem] p-8 border border-rose-500/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                          <AlertTriangle className="w-32 h-32 text-rose-500" />
                        </div>
                        <div className="relative z-10">
                          <h3 className="text-rose-400 font-bold mb-2">Vaciar Base de Datos</h3>
                          <p className="text-slate-400 text-xs mb-6 max-w-lg leading-relaxed">
                            Se eliminarán todas las transacciones, estados de cuenta, presupuestos, metas, suscripciones, 
                            recordatorios, snapshots, activos y logs de importación. 
                            Las cuentas se conservarán con saldo en $0. Las categorías y configuración permanecen intactas.
                          </p>
                          <button
                            onClick={async () => {
                              const firstConfirm = window.confirm("¡ADVERTENCIA!\n\n¿Estás seguro?");
                              if (!firstConfirm) return;
                              const secondConfirm = window.prompt('Escribe "ELIMINAR TODO":');
                              if (secondConfirm !== 'ELIMINAR TODO') return;
                              try {
                                await configAPI.wipeDatabase();
                                setToast({ message: 'Sistema reiniciado', type: 'success' });
                                setTimeout(() => window.location.reload(), 1500);
                              } catch (_error) {
                                setToast({ message: 'Error al limpiar', type: 'error' });
                              }
                            }}
                            className="px-6 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-xs font-black uppercase tracking-widest"
                          >
                            Eliminar Todo el Historial
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'security' && (
                  <div className="space-y-10">
                    <section>
                      <DeviceManager />
                    </section>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
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
