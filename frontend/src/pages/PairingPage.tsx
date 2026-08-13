import React, { useState, useEffect } from 'react';
import { Shield, Smartphone, ArrowRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { authAPI } from '../services/api';
import { format } from 'date-fns';
import type { AxiosError } from 'axios';

export default function PairingPage() {
  const [pin, setPin] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    // Suggest a device name based on User Agent
    const ua = navigator.userAgent;
    let suggestedName = 'Dispositivo Móvil';
    if (ua.includes('iPhone')) suggestedName = 'iPhone';
    else if (ua.includes('Android')) suggestedName = 'Android Device';
    else if (ua.includes('iPad')) suggestedName = 'iPad';
    
    setDeviceName(`${suggestedName} - ${format(new Date(), 'HH:mm')}`);
  }, []);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) {
      setError('El PIN debe tener 6 dígitos');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError('');

    try {
      const response = await authAPI.consumePairingCode(pin, deviceName);

      // La cookie de sesión httpOnly ya quedó seteada por el backend en esta
      // misma respuesta. Sólo persistimos la baseURL para que AuthGuard sepa
      // contra qué backend preguntar en visitas futuras.
      const baseUrl = response.config.baseURL || `http://${window.location.hostname}:8001`;
      localStorage.setItem('finance_base_url', baseUrl);
      
      setStatus('success');
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (err) {
      console.error('[Pairing] Error:', err);
      setError((err as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al vincular el dispositivo. Verifica el PIN.');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 selection:bg-indigo-500/30">
      {/* Abstract Background Decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-slate-900/50 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="text-center space-y-3 mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 mb-2">
              <Shield className="w-8 h-8 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Vincular Dispositivo</h1>
            <p className="text-slate-400 text-sm">
              Introduce el código de 6 dígitos generado en tu laptop para autorizar este acceso.
            </p>
          </div>

          {status === 'success' ? (
            <div className="text-center py-8 space-y-4 animate-in fade-in zoom-in duration-500">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                <CheckCircle className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white">¡Vinculado con éxito!</h2>
                <p className="text-slate-400 text-sm">Redirigiendo a tu dashboard...</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePair} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Código de Vinculación
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-800/50 border border-white/10 rounded-2xl py-4 px-6 text-center text-3xl font-mono font-bold text-white tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Nombre del Dispositivo
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Smartphone className="w-4 h-4 text-slate-500" />
                    </div>
                    <input
                      type="text"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      className="w-full bg-slate-800/50 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
                      required
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl animate-in slide-in-from-top-2">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  <p className="text-sm text-rose-200">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || pin.length !== 6}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group"
              >
                {status === 'loading' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Autorizar Acceso</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Info */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">
              Protocolo de Seguridad Tabula Rasa • Grado Bancario
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
