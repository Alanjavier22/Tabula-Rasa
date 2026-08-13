import { Lock, Cloud, CheckCircle, Save, RefreshCw, Sparkles } from 'lucide-react';
import type { AxiosError } from 'axios';
import { aiAPI, driveConfigAPI } from '../../services/api';
import type { GoogleDriveCredentials, ToastMessage } from './types';

interface AITabProps {
  geminiApiKey: string;
  onGeminiApiKeyChange: (value: string) => void;
  hasDriveCredentials: boolean;
  driveCredentials: GoogleDriveCredentials;
  onDriveCredentialsChange: (creds: GoogleDriveCredentials) => void;
  savingDriveCredentials: boolean;
  onSaveDriveCredentials: () => void;
  authorizingDrive: boolean;
  onAuthorizeDrive: () => void;
  testingGemini: boolean;
  setTestingGemini: (value: boolean) => void;
  testingDrive: boolean;
  setTestingDrive: (value: boolean) => void;
  setToast: (toast: ToastMessage) => void;
}

const AITab = ({
  geminiApiKey,
  onGeminiApiKeyChange,
  hasDriveCredentials,
  driveCredentials,
  onDriveCredentialsChange,
  savingDriveCredentials,
  onSaveDriveCredentials,
  authorizingDrive,
  onAuthorizeDrive,
  testingGemini,
  setTestingGemini,
  testingDrive,
  setTestingDrive,
  setToast,
}: AITabProps) => {
  return (
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
              value={geminiApiKey}
              onChange={e => onGeminiApiKeyChange(e.target.value)}
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
                onChange={(e) => onDriveCredentialsChange({ ...driveCredentials, client_id: e.target.value })}
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
                  onChange={(e) => onDriveCredentialsChange({ ...driveCredentials, client_secret: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all"
                  placeholder="GOCSPX-..."
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Refresh Token</label>
                <input
                  type="password"
                  value={driveCredentials.refresh_token}
                  onChange={(e) => onDriveCredentialsChange({ ...driveCredentials, refresh_token: e.target.value })}
                  className="w-full bg-slate-900/50 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all"
                  placeholder="//..."
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={onSaveDriveCredentials}
              disabled={savingDriveCredentials}
              className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest disabled:opacity-50"
            >
              {savingDriveCredentials ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-blue-400" />}
              <span>Guardar Credenciales</span>
            </button>

            <button
              onClick={onAuthorizeDrive}
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
                } catch {
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
                } catch (e) {
                  const msg = (e as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error de servidor al probar OAuth2';
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
  );
};

export default AITab;
