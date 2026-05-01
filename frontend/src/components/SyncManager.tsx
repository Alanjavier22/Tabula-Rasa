import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { authAPI } from '../services/api';

export const SyncManager: React.FC = () => {
  const [pin, setPin] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePairing = async () => {
    setIsGenerating(true);
    setError(null);
    setIsLinked(false);
    try {
      const response = await authAPI.generatePairingCode();
      setPin(response.data.pin);
      setQrUrl(response.data.qr_url);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al generar código de emparejamiento.");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (pin && !isLinked) {
      interval = setInterval(async () => {
        try {
          const res = await authAPI.getPairingStatus(pin);
          if (res.data.used) {
            setIsLinked(true);
            setPin(null);
          }
        } catch (err: any) {
          // Si el PIN expira, el backend devuelve 404
          if (err.response?.status === 404) {
            setPin(null);
            setError("El código de emparejamiento ha expirado.");
          }
        }
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pin, isLinked]);

  return (
    <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700/50 relative overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            📱 Sincronización Móvil (Local-First)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Empareja tu dispositivo móvil escaneando este código QR desde tu misma red WiFi.
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!pin && !isLinked && (
          <motion.div
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-4"
          >
            <button
              onClick={handleGeneratePairing}
              disabled={isGenerating}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 px-6 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isGenerating ? "Generando..." : "Vincular Nuevo Dispositivo"}
            </button>
            {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
          </motion.div>
        )}

        {pin && !isLinked && (
          <motion.div
            key="qr"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center p-6 bg-slate-900/50 rounded-xl"
          >
            <div className="bg-white p-4 rounded-xl mb-4">
              <QRCodeSVG 
                value={qrUrl || ''} 
                size={200}
                level="H"
              />
            </div>
            <div className="text-center">
              <p className="text-slate-300 text-sm mb-1">O ingresa este PIN manualmente:</p>
              <p className="text-3xl font-mono font-bold text-emerald-400 tracking-widest">{pin}</p>
            </div>
            <p className="text-xs text-slate-500 mt-4 animate-pulse">Esperando conexión...</p>
          </motion.div>
        )}

        {isLinked && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-10"
          >
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-emerald-400 mb-2">¡Dispositivo Vinculado Exitosamente!</h3>
            <p className="text-slate-400 text-sm text-center">
              El dispositivo ahora tiene acceso completo para sincronizar.
            </p>
            <button
              onClick={() => setIsLinked(false)}
              className="mt-6 text-sm text-slate-400 hover:text-white underline"
            >
              Vincular otro dispositivo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
