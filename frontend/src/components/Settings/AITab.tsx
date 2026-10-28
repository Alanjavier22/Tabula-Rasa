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
          <div className="w-10 h-10 rounded-xl bg-info-soft flex items-center justify-center border border-line">
            <Lock className="w-5 h-5 text-info" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Seguridad API</h2>
            <p className="text-muted text-sm">Conexión con el cerebro de Google Gemini</p>
          </div>
        </div>

        <div className="bg-surface-soft rounded-3xl p-6 border border-line">
          <label htmlFor="gemini-api-key" className="block text-xs font-black text-muted uppercase tracking-widest mb-3">Gemini API Key</label>
          <div className="relative">
            <input
              id="gemini-api-key"
              type="password"
              value={geminiApiKey}
              onChange={e => onGeminiApiKeyChange(e.target.value)}
              placeholder="Ingresa tu API Key de Gemini..."
              className="w-full bg-canvas border border-line rounded-xl px-4 py-4 text-primary font-mono text-sm focus:outline-none focus:border-line transition-all"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center border border-line">
              <Cloud className="w-5 h-5 text-accent-strong" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Credenciales OAuth</h2>
              <p className="text-muted text-sm">Vínculo con Google Drive para respaldos</p>
            </div>
          </div>
          {hasDriveCredentials && (
            <div className="px-4 py-1.5 bg-success-soft border border-line text-success text-xs font-black uppercase tracking-widest rounded-full flex items-center gap-2">
              <CheckCircle className="w-3 h-3" />
              Sincronizado
            </div>
          )}
        </div>

        <div className="bg-surface-soft rounded-3xl p-8 border border-line space-y-5">
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label htmlFor="drive-client-id" className="block text-xs font-black text-muted uppercase tracking-wide mb-2">Client ID</label>
              <input
                id="drive-client-id"
                type="text"
                value={driveCredentials.client_id}
                onChange={(e) => onDriveCredentialsChange({ ...driveCredentials, client_id: e.target.value })}
                className="w-full bg-canvas border border-line rounded-xl px-4 py-3 text-primary text-sm focus:outline-none focus:border-line transition-all"
                placeholder=".apps.googleusercontent.com"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="drive-client-secret" className="block text-xs font-black text-muted uppercase tracking-wide mb-2">Client Secret</label>
                <input
                  id="drive-client-secret"
                  type="password"
                  value={driveCredentials.client_secret}
                  onChange={(e) => onDriveCredentialsChange({ ...driveCredentials, client_secret: e.target.value })}
                  className="w-full bg-canvas border border-line rounded-xl px-4 py-3 text-primary text-sm focus:outline-none focus:border-line transition-all"
                  placeholder="GOCSPX-..."
                />
              </div>
              <div>
                <label htmlFor="drive-refresh-token" className="block text-xs font-black text-muted uppercase tracking-wide mb-2">Refresh Token</label>
                <input
                  id="drive-refresh-token"
                  type="password"
                  value={driveCredentials.refresh_token}
                  onChange={(e) => onDriveCredentialsChange({ ...driveCredentials, refresh_token: e.target.value })}
                  className="w-full bg-canvas border border-line rounded-xl px-4 py-3 text-primary text-sm focus:outline-none focus:border-line transition-all"
                  placeholder="//..."
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={onSaveDriveCredentials}
              disabled={savingDriveCredentials}
              className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-surface-soft border border-line text-primary hover:bg-surface-soft transition-all text-xs font-black uppercase tracking-widest disabled:opacity-50"
            >
              {savingDriveCredentials ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-info" />}
              <span>Guardar Credenciales</span>
            </button>

            <button
              onClick={onAuthorizeDrive}
              disabled={authorizingDrive || (!driveCredentials.client_id && !hasDriveCredentials)}
              className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-accent-strong hover:bg-accent-strong text-on-color transition-all text-xs font-black uppercase tracking-widest shadow-lg  disabled:opacity-30"
            >
              {authorizingDrive ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Autorizar con Google</span>
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center border border-line">
            <RefreshCw className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Pruebas de Conectividad</h2>
            <p className="text-muted text-sm">Verifica los canales de comunicación externos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface-soft rounded-3xl p-6 border border-line">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent-strong" />
                <span className="text-sm font-bold text-primary">Google Gemini</span>
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
              className="w-full py-3 bg-surface-soft hover:bg-surface-soft rounded-xl text-xs font-bold text-muted transition-all border border-line flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {testingGemini ? (
                <RefreshCw className="w-3 h-3 animate-spin text-accent-strong" />
              ) : (
                <Sparkles className="w-3 h-3 text-accent-strong" />
              )}
              {testingGemini ? 'Verificando...' : 'Verificar API Key'}
            </button>
          </div>

          <div className="bg-surface-soft rounded-3xl p-6 border border-line">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-info" />
                <span className="text-sm font-bold text-primary">Google Drive</span>
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
              className="w-full py-3 bg-surface-soft hover:bg-surface-soft rounded-xl text-xs font-bold text-muted transition-all border border-line flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {testingDrive ? (
                <RefreshCw className="w-3 h-3 animate-spin text-info" />
              ) : (
                <Cloud className="w-3 h-3 text-info" />
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
