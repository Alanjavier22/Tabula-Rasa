import React, { useState, useEffect } from 'react';
import { Smartphone, Trash2, Plus, Clock, ShieldCheck, RefreshCw, AlertTriangle, Key } from 'lucide-react';
import { authAPI } from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { QRCodeSVG } from 'qrcode.react';

// El backend serializa datetimes en UTC pero sin sufijo de zona horaria
// ("2026-08-13T01:23:17", sin "Z") - un ISO string sin zona lo interpreta
// el navegador como hora LOCAL, no UTC, así que sin este ajuste "Sinc: hace
// X" queda corrido por el offset local completo (en Ecuador, UTC-5, se veía
// "Sinc: en 5 horas" en vez de "hace unos segundos").
const parseBackendUTC = (iso: string): Date => {
  const hasTimezone = /[Zz]|[+-]\d{2}:\d{2}$/.test(iso);
  return new Date(hasTimezone ? iso : `${iso}Z`);
};

interface Device {
  id: string;
  device_name: string;
  last_sync: string | null;
  is_active: boolean;
  created_at: string;
}

export default function DeviceManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairingCode, setPairingCode] = useState<{ pin: string; expires_in: number; qr_url?: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchDevices = React.useCallback(async () => {
    try {
      const response = await authAPI.listDevices();
      setDevices(response.data);
    } catch (error) {
      console.error('[DeviceManager] Error fetching devices:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      const response = await authAPI.generatePairingCode();
      const { pin, expires_in_seconds, qr_url } = response.data;
      
      setPairingCode({
        pin,
        expires_in: expires_in_seconds,
        qr_url
      });
      
      // Auto-clear code after expiration
      setTimeout(() => setPairingCode(null), expires_in_seconds * 1000);
    } catch (error) {
      console.error('[DeviceManager] Error generating code:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas revocar el acceso a este dispositivo?')) return;
    
    try {
      await authAPI.revokeDevice(id);
      setDevices(devices.filter(d => d.id !== id));
    } catch (error) {
      console.error('[DeviceManager] Error revoking device:', error);
    }
  };

  // Helper to extract IP from qr_url
  const getAccessUrl = () => {
    if (!pairingCode?.qr_url) return null;
    try {
      const url = new URL(pairingCode.qr_url);
      return `${url.protocol}//${url.host}`;
    } catch {
      return null;
    }
  };

  const accessUrl = getAccessUrl();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-400" />
            Dispositivos Vinculados
          </h3>
          <p className="text-sm text-slate-400">Gestiona los accesos autorizados a tu ecosistema financiero.</p>
        </div>
        <button
          onClick={handleGenerateCode}
          disabled={generating || !!pairingCode}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-4 py-2 rounded-xl transition-all font-bold text-sm shadow-lg shadow-indigo-500/20"
        >
          {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Vincular Nuevo
        </button>
      </div>

      {pairingCode && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-[2.5rem] p-8 animate-in zoom-in duration-300 relative overflow-hidden group">
          {/* Background Decorative Circles */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col items-center text-center space-y-6 relative z-10">
            <div className="flex items-center gap-2 text-indigo-400 font-black text-[10px] uppercase tracking-[0.3em]">
              <Key className="w-4 h-4" />
              Código de Vinculación Temporal
            </div>
            
            <div className="text-6xl font-mono font-black text-white tracking-[0.2em] bg-black/40 px-10 py-6 rounded-[2rem] border border-white/5 shadow-2xl group-hover:scale-105 transition-transform duration-500">
              {pairingCode.pin}
            </div>

            <div className="space-y-4 max-w-sm">
              <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-2">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Instrucciones de Acceso</p>
                <p className="text-sm text-slate-300 font-medium leading-relaxed">
                  Ingresa esta dirección en el navegador de tu celular:
                </p>
                <div className="flex items-center justify-center gap-2 py-2 px-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 font-mono text-sm break-all">
                  {accessUrl || 'Cargando IP...'}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 font-medium">
                Válido por <span className="text-indigo-400 font-bold">{Math.ceil(pairingCode.expires_in / 60)} minutos</span>. 
                Asegúrate de que ambos dispositivos estén en la misma red Wi-Fi.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {loading ? (
          <div className="h-32 flex items-center justify-center bg-slate-900/30 rounded-2xl border border-white/5">
            <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/30 rounded-2xl border border-dashed border-white/10 space-y-3">
            <Smartphone className="w-12 h-12 text-slate-700 mx-auto" />
            <p className="text-slate-500 text-sm">No hay dispositivos externos vinculados.</p>
          </div>
        ) : (
          devices.map((device) => (
            <div 
              key={device.id}
              className="group flex items-center justify-between p-4 bg-slate-900/50 hover:bg-indigo-500/5 border border-white/5 rounded-2xl transition-all duration-300"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${device.is_active ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800 border-white/5'} border`}>
                  <Smartphone className={`w-6 h-6 ${device.is_active ? 'text-emerald-400' : 'text-slate-500'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-sm">{device.device_name}</h4>
                    {device.device_name === 'Host-PC' && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">Local</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Sinc: {device.last_sync ? formatDistanceToNow(parseBackendUTC(device.last_sync), { addSuffix: true, locale: es }) : 'Nunca'}
                    </span>
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Activo
                    </span>
                  </div>
                </div>
              </div>

              {device.device_name !== 'Host-PC' && (
                <button
                  onClick={() => handleRevoke(device.id)}
                  className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Revocar Acceso"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-200/70 leading-relaxed">
          <strong className="text-amber-400 block mb-0.5">Consejo de Seguridad</strong>
          Cualquier dispositivo con acceso puede ver tus finanzas completas. Revoca el acceso de dispositivos que ya no utilices o si sospechas que tu red ha sido comprometida.
        </p>
      </div>
    </div>
  );
}
