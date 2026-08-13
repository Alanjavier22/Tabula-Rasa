import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  configAPI,
  categoriesAPI,
  driveConfigAPI,
  backupAPI,
} from '../services/api';
import {
  Save,
  RefreshCw,
  Cpu,
  Settings as SettingsIcon,
  ChevronRight,
  Lock,
  Sparkles,
  Cloud,
} from 'lucide-react';
import DeviceManager from '../components/Settings/DeviceManager';
import GeneralTab from '../components/Settings/GeneralTab';
import AITab from '../components/Settings/AITab';
import LabsTab from '../components/Settings/LabsTab';
import CloudTab from '../components/Settings/CloudTab';
import Toast from '../components/Toast';
import type { Category, BackupFile, Config } from '../types';
import type { AxiosError } from 'axios';
import type { ConfigData, GoogleDriveCredentials, GoogleDriveStatus } from '../components/Settings/types';

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

      configRes.data.forEach((c: Config) => {
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
    } catch (e) {
      console.error('Error loading backups:', e);
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    loadDriveCredentials();
    handleLoadBackups();
  }, [fetchData, loadDriveCredentials, handleLoadBackups]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const upsertConfig = async (key: string, data: Partial<Config>) => {
        try {
          await configAPI.getByKey(key);
          await configAPI.update(key, data);
        } catch {
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

  const handleQuickSave = async (key: string, value: string | number | string[], type: 'string' | 'json' | 'number') => {
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
    } catch (e) {
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
    } catch (error) {
      console.error('Error getting auth URL:', error);
      const msg = (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al iniciar autorización';
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
    } catch (e) {
      console.error('Error restoring backup:', e);
      setToast({ message: 'Error al restaurar backup', type: 'error' });
    }
  };

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
                  <GeneralTab
                    categories={categories}
                    config={config}
                    onBufferChange={(value) => setConfig({ ...config, safe_to_spend_buffer: value })}
                    exporting={exporting}
                    onExportCSV={handleExportCSV}
                    onToggleCategory={toggleCategory}
                  />
                )}

                {activeTab === 'ai' && (
                  <AITab
                    geminiApiKey={config.gemini_api_key}
                    onGeminiApiKeyChange={(value) => setConfig({ ...config, gemini_api_key: value })}
                    hasDriveCredentials={hasDriveCredentials}
                    driveCredentials={driveCredentials}
                    onDriveCredentialsChange={setDriveCredentials}
                    savingDriveCredentials={savingDriveCredentials}
                    onSaveDriveCredentials={handleSaveDriveCredentials}
                    authorizingDrive={authorizingDrive}
                    onAuthorizeDrive={handleAuthorizeDrive}
                    testingGemini={testingGemini}
                    setTestingGemini={setTestingGemini}
                    testingDrive={testingDrive}
                    setTestingDrive={setTestingDrive}
                    setToast={setToast}
                  />
                )}

                {activeTab === 'labs' && (
                  <LabsTab
                    aiPersona={config.ai_persona}
                    onPersonaChange={(personaId) => {
                      setConfig({ ...config, ai_persona: personaId });
                      handleQuickSave('ai_persona', personaId, 'string');
                    }}
                    setToast={setToast}
                  />
                )}

                {activeTab === 'cloud' && (
                  <CloudTab
                    backups={backups}
                    loadingBackups={loadingBackups}
                    creatingBackup={creatingBackup}
                    onCreateBackup={handleCreateBackup}
                    onRestoreBackup={handleRestoreBackup}
                    setToast={setToast}
                  />
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
