import React, { useState, useEffect, useRef } from 'react';
import { authAPI } from '../services/api';
import api from '../services/api';

const LOCALHOST_BASE_URL = 'http://127.0.0.1:8001';
const LOCALHOST_HOSTS = ['localhost', '127.0.0.1'];
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 2000;

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLocalhostConnecting, setIsLocalhostConnecting] = useState<boolean>(false);
  const [localhostError, setLocalhostError] = useState<string | null>(null);
  const [isDeepLinkPairing, setIsDeepLinkPairing] = useState<boolean>(false);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  const isLocalhost = LOCALHOST_HOSTS.includes(window.location.hostname);

  const checkSession = React.useCallback(async () => {
    try {
      await authAPI.me();
      setIsAuthenticated(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const autoLinkViaDeepLink = React.useCallback(async (apiUrl: string, pin: string) => {
    setIsDeepLinkPairing(true);
    setDeepLinkError(null);

    try {
      localStorage.setItem('finance_base_url', apiUrl);
      api.defaults.baseURL = apiUrl;

      const deviceName = `Mobile-${navigator.platform || 'Unknown'}`;
      await api.post('/auth/pair/consume', {
        pin,
        device_name: deviceName,
      });

      // La cookie de sesión ya quedó seteada por el backend en esta misma respuesta.
      window.history.replaceState({}, document.title, window.location.pathname);
      setIsAuthenticated(true);
    } catch (err: any) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const detail = err.response?.data?.detail || err.message || 'Error al vincular el dispositivo.';
      setDeepLinkError(detail);
    } finally {
      setIsDeepLinkPairing(false);
    }
  }, []);

  const autoLinkLocalhost = React.useCallback(async () => {
    setIsLocalhostConnecting(true);
    setLocalhostError(null);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await authAPI.pairLocalhost();
        localStorage.setItem('finance_base_url', LOCALHOST_BASE_URL);

        setIsAuthenticated(true);
        setIsLocalhostConnecting(false);
        return;
      } catch (err: any) {
        if (err?.response?.status === 403) {
          setLocalhostError('Acceso denegado: este endpoint solo está disponible desde la máquina host.');
          setIsLocalhostConnecting(false);
          return;
        }

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }

    setLocalhostError('No se pudo conectar al servidor local después de varios intentos.');
    setIsLocalhostConnecting(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const baseUrl = localStorage.getItem('finance_base_url');
        if (baseUrl) {
          api.defaults.baseURL = baseUrl;
        }

        const params = new URLSearchParams(window.location.search);
        const apiUrl = params.get('apiUrl');
        const pin = params.get('pin');

        if (apiUrl && pin) {
          await autoLinkViaDeepLink(apiUrl, pin);
          return;
        }

        // Sólo vale la pena consultar /auth/me si ya sabemos a qué backend
        // preguntarle (baseUrl de una vinculación previa) o si estamos en el
        // propio host, donde /auth/pair/localhost siempre es una alternativa.
        if (baseUrl || isLocalhost) {
          const hasSession = await checkSession();
          if (hasSession || cancelled) return;
        }

        if (isLocalhost && !attemptedRef.current) {
          attemptedRef.current = true;
          autoLinkLocalhost();
        }
      } catch (err) {
        console.error('Error during authentication initialization:', err);
        setDeepLinkError('Error al procesar la URL de vinculación.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLocalhost, autoLinkViaDeepLink, autoLinkLocalhost, checkSession]);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Allow pairing page to render even if not authenticated
  if (window.location.pathname === '/pair') {
    return <>{children}</>;
  }

  // --- Visual Feedback for Automatic Processes ---
  
  if (isDeepLinkPairing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-2">Vinculando dispositivo…</h1>
          <p className="text-slate-400">Conectando con el servidor local.</p>
        </div>
      </div>
    );
  }

  if (isLocalhost && isLocalhostConnecting) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-2">Conectando al servidor local…</h1>
          <p className="text-slate-400">Vinculando automáticamente la máquina host.</p>
        </div>
      </div>
    );
  }

  const error = deepLinkError || localhostError;
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-rose-500/30">
            <svg className="w-10 h-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Error de Conexión</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-6 rounded-xl border border-white/10 transition-all"
          >
            Reintentar Conexión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
          <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-black tracking-tight mb-4">Acceso Restringido</h1>
        <p className="text-slate-400 mb-8 leading-relaxed">
          Este dispositivo no está autorizado para acceder a tus finanzas. 
          Por seguridad, debes vincularlo usando un código generado desde tu equipo host.
        </p>

        <button 
          onClick={() => window.location.href = '/pair'}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-2xl shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group"
        >
          <span>Vincular este dispositivo</span>
          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>

        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest pt-4">
          Protocolo de Seguridad Tabula Rasa
        </p>
      </div>
    </div>
  );
};
