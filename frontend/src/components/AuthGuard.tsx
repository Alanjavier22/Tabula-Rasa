import React, { useState, useEffect, useRef } from 'react';
import api, { authAPI } from '../services/api';
import type { AxiosError } from 'axios';

// Mismo hostname que la página para conservar el alcance local de la cookie
// y evitar que una configuración antigua de red desvíe las peticiones.
const LOCALHOST_BASE_URL = `http://${window.location.hostname}:8001`;
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1']);
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 2000;

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLocalhostConnecting, setIsLocalhostConnecting] = useState<boolean>(false);
  const [localhostError, setLocalhostError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  const isLocalhost = LOCALHOST_HOSTS.has(window.location.hostname);

  const checkSession = React.useCallback(async () => {
    try {
      await authAPI.me();
      setIsAuthenticated(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const autoLinkLocalhost = React.useCallback(async () => {
    setIsLocalhostConnecting(true);
    setLocalhostError(null);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await authAPI.pairLocalhost();
        setIsAuthenticated(true);
        setIsLocalhostConnecting(false);
        return;
      } catch (err) {
        if ((err as AxiosError).response?.status === 403) {
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
        if (!isLocalhost) {
          setLocalhostError('El acceso remoto está deshabilitado por ahora. Abre Tabula Rasa en la máquina host.');
          return;
        }

        // El backend de esta instalación solo acepta sesiones locales. Limpiar
        // una URL LAN antigua evita que una configuración de pairing previa
        // siga desviando las peticiones.
        localStorage.removeItem('finance_base_url');
        api.defaults.baseURL = LOCALHOST_BASE_URL;

        const hasSession = await checkSession();
        if (hasSession || cancelled) return;

        if (!attemptedRef.current) {
          attemptedRef.current = true;
          autoLinkLocalhost();
        }
      } catch (err) {
        console.error('Error during authentication initialization:', err);
        setLocalhostError('Error al iniciar la sesión local.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLocalhost, autoLinkLocalhost, checkSession]);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  // --- Visual Feedback for Automatic Processes ---
  if (isLocalhost && isLocalhostConnecting) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-primary">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 border-4 border-line border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-2">Conectando al servidor local…</h1>
          <p className="text-muted">Vinculando automáticamente la máquina host.</p>
        </div>
      </div>
    );
  }

  const error = localhostError;
  if (error) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-primary">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-danger-soft rounded-2xl flex items-center justify-center mx-auto mb-6 border border-line">
            <svg className="w-10 h-10 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Error de Conexión</h1>
          <p className="text-muted mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-surface hover:bg-surface text-primary font-medium py-3 px-6 rounded-xl border border-line transition-all"
          >
            Reintentar Conexión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-primary">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 bg-accent-soft rounded-2xl flex items-center justify-center mx-auto mb-6 border border-line">
          <svg className="w-10 h-10 text-accent-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h1 className="text-3xl font-black tracking-tight mb-4">Acceso Restringido</h1>
        <p className="text-muted mb-8 leading-relaxed">
          Tabula Rasa está configurado para funcionar únicamente en la máquina host.
          Abre la aplicación desde <span className="text-accent-strong font-semibold">localhost</span> para continuar.
        </p>

        <p className="text-xs text-muted font-bold uppercase tracking-widest pt-4">
          Protocolo de Seguridad Tabula Rasa
        </p>
      </div>
    </div>
  );
};
