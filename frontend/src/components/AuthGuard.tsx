import React, { useState, useEffect, useRef } from 'react';
import { QRScanner } from './QRScanner';
import { authAPI } from '../services/api';
import api from '../services/api';
import { maintenanceService } from '../services/MaintenanceService';
import { getTokenKey } from '../services/api';

const LOCALHOST_BASE_URL = 'http://127.0.0.1:8001';
const LOCALHOST_HOSTS = ['localhost', '127.0.0.1'];
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 2000;

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isLocalhostConnecting, setIsLocalhostConnecting] = useState<boolean>(false);
  const [localhostError, setLocalhostError] = useState<string | null>(null);
  const [isDeepLinkPairing, setIsDeepLinkPairing] = useState<boolean>(false);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  const isLocalhost = LOCALHOST_HOSTS.includes(window.location.hostname);

  useEffect(() => {
    try {
      const tokenKey = getTokenKey();
      const token = localStorage.getItem(tokenKey);
      const baseUrl = localStorage.getItem('finance_base_url');

      if (token && baseUrl) {
        setIsAuthenticated(true);
        return;
      }

      // Deep link: móvil abrió la URL del QR con ?apiUrl=...&pin=...
      const params = new URLSearchParams(window.location.search);
      const apiUrl = params.get('apiUrl');
      const pin = params.get('pin');

      if (apiUrl && pin) {
        autoLinkViaDeepLink(apiUrl, pin);
        return;
      }

      // Auto-vinculación solo para el host (localhost / 127.0.0.1)
      if (isLocalhost && !attemptedRef.current) {
        attemptedRef.current = true;
        autoLinkLocalhost();
      }
    } catch (err) {
      console.error('Error during authentication initialization:', err);
      setDeepLinkError('Error al procesar la URL de vinculación. Por favor, escanea el QR manualmente.');
    }
  }, []);

  const autoLinkViaDeepLink = async (apiUrl: string, pin: string) => {
    setIsDeepLinkPairing(true);
    setDeepLinkError(null);

    try {
      // Set baseURL BEFORE making the API call
      localStorage.setItem('finance_base_url', apiUrl);
      api.defaults.baseURL = apiUrl;

      const deviceName = `Mobile-${navigator.platform || 'Unknown'}`;
      const res = await api.post('/auth/pair/consume', {
        pin,
        device_name: deviceName,
      });

      const tokenKey = getTokenKey();
      localStorage.setItem(tokenKey, res.data.access_token);

      // Limpiar query params para no dejar el PIN visible en la URL
      window.history.replaceState({}, document.title, window.location.pathname);

      setIsAuthenticated(true);
      
      // Run maintenance tasks after successful authentication
      maintenanceService.runMaintenance().catch(err => {
        console.error('[AuthGuard] Maintenance error:', err);
      });
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Error al vincular el dispositivo.';
      setDeepLinkError(detail);
    } finally {
      setIsDeepLinkPairing(false);
    }
  };

  const autoLinkLocalhost = async () => {
    setIsLocalhostConnecting(true);
    setLocalhostError(null);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await authAPI.pairLocalhost();
        const { access_token } = res.data;

        const tokenKey = getTokenKey();
        localStorage.setItem(tokenKey, access_token);
        localStorage.setItem('finance_base_url', LOCALHOST_BASE_URL);

        setIsAuthenticated(true);
        setIsLocalhostConnecting(false);
        return;
      } catch (err: any) {
        // Si el backend devolvió 403 no tiene sentido reintentar
        if (err?.response?.status === 403) {
          setLocalhostError('Acceso denegado: este endpoint solo está disponible desde la máquina host.');
          setIsLocalhostConnecting(false);
          return;
        }

        // Reintentar en caso de error de red (backend aún no levantó)
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }

    // Agotados los reintentos
    setLocalhostError('No se pudo conectar al servidor local después de varios intentos.');
    setIsLocalhostConnecting(false);
  };

  const handleScanSuccess = () => {
    // The scanner already saved the token to localStorage.
    const tokenKey = getTokenKey();
    const token = localStorage.getItem(tokenKey);
    const baseUrl = localStorage.getItem('finance_base_url');
    if (token && baseUrl) {
      setIsAuthenticated(true);
      setIsScanning(false);
      
      // Run maintenance tasks after successful authentication
      maintenanceService.runMaintenance().catch(err => {
        console.error('[AuthGuard] Maintenance error:', err);
      });
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  // --- Estado de deep-link: vinculando vía QR URL ---
  if (isDeepLinkPairing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-2">Vinculando dispositivo…</h1>
          <p className="text-slate-400">Conectando con el servidor local.</p>
        </div>
      </div>
    );
  }

  if (deepLinkError) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Error de vinculación</h1>
          <p className="text-slate-400 mb-6">{deepLinkError}</p>
          <button
            onClick={() => setIsScanning(true)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 px-6 rounded-xl shadow-lg transition-colors"
          >
            Escanear QR manualmente
          </button>
        </div>
      </div>
    );
  }

  // --- Estado de conexión automática para localhost ---
  if (isLocalhost && isLocalhostConnecting) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-2">Conectando al servidor local…</h1>
          <p className="text-slate-400">Vinculando automáticamente la máquina host.</p>
        </div>
      </div>
    );
  }

  if (isLocalhost && localhostError) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Error de conexión</h1>
          <p className="text-slate-400 mb-6">{localhostError}</p>
          <button
            onClick={() => {
              attemptedRef.current = false;
              autoLinkLocalhost();
            }}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 px-6 rounded-xl shadow-lg transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // --- Flujo normal: pantalla de bienvenida + QR scanner (dispositivos remotos) ---
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold mb-4">Finance Local-First</h1>
        <p className="text-slate-400 mb-8">
          Esta aplicación opera 100% offline y en red local. 
          Vincúlala con el servidor en tu PC para comenzar a sincronizar tus finanzas de manera segura y privada.
        </p>

        {!isScanning ? (
          <button 
            onClick={() => setIsScanning(true)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-4 px-6 rounded-xl shadow-lg transition-colors"
          >
            Vincular Dispositivo (Escanear QR)
          </button>
        ) : (
          <QRScanner 
            onSuccess={handleScanSuccess}
            onCancel={() => setIsScanning(false)}
          />
        )}
      </div>
    </div>
  );
};
