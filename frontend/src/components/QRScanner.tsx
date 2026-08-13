import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import axios, { type AxiosError } from 'axios';
import { motion } from 'framer-motion';

interface QRScannerProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onSuccess, onCancel }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const parseQrPayload = (result: string): { apiUrl: string; pin: string } => {
    // Nuevo formato: URL con query params  http://<IP>:5173/?apiUrl=...&pin=...
    try {
      const url = new URL(result);
      const apiUrl = url.searchParams.get('apiUrl');
      const pin = url.searchParams.get('pin');
      if (apiUrl && pin) return { apiUrl, pin };
    } catch {
      // No es una URL válida — intentar formato legacy JSON
    }

    // Legacy: JSON  {"url": "...", "pin": "..."}
    try {
      const payload = JSON.parse(result);
      if (payload.url && payload.pin) return { apiUrl: payload.url, pin: payload.pin };
    } catch {
      // No es JSON válido
    }

    throw new Error("Formato de QR inválido.");
  };

  const handleScan = async (result: string) => {
    if (loading) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const { apiUrl, pin } = parseQrPayload(result);

      // Overwrite the base URL dynamically based on the QR code (ignores .env)
      const dynamicApi = axios.create({
        baseURL: apiUrl,
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
        }
      });

      // Get device name
      const deviceName = `Mobile-${navigator.platform || 'Unknown'}`;

      // Hit the specific endpoint - la cookie de sesión httpOnly queda
      // seteada por el backend en esta misma respuesta.
      await dynamicApi.post('/auth/pair/consume', {
        pin,
        device_name: deviceName
      });

      localStorage.setItem('finance_base_url', apiUrl);

      onSuccess();
    } catch (err) {
      console.error(err);
      const axiosErr = err as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || "Error al procesar el QR.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-md"
      >
        <h2 className="text-xl font-bold text-white mb-4 text-center">Escanear QR de Vinculación</h2>
        <p className="text-slate-400 text-sm text-center mb-6">
          Apunta la cámara al código QR mostrado en tu PC.
        </p>

        <div className="rounded-xl overflow-hidden bg-black aspect-square relative mb-6">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 z-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
            </div>
          ) : null}
          <Scanner 
            onScan={(result) => {
              if (result && result.length > 0) {
                 handleScan(result[0].rawValue);
              }
            }} 
            onError={(err) => console.error(err)} 
          />
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm mb-4 text-center">
            {error}
          </div>
        )}

        <button
          onClick={onCancel}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
      </motion.div>
    </div>
  );
};
