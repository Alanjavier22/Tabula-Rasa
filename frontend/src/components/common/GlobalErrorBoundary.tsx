import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { db } from '../../db/db';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  countdown: number;
  errorType: 'general' | 'database' | 'config';
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      countdown: 3,
      errorType: 'general'
    };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorStr = error.message.toLowerCase();
    let errorType: State['errorType'] = 'general';
    
    if (errorStr.includes('dexie') || errorStr.includes('database') || errorStr.includes('indexeddb')) {
      errorType = 'database';
    } else if (errorStr.includes('config') || errorStr.includes('base_url') || errorStr.includes('8000')) {
      errorType = 'config';
    }

    return { hasError: true, countdown: 3, errorType };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Phoenix] Error caught:', error, errorInfo);
    this.executeEmergencySanitization(error);
  }

  executeEmergencySanitization = (error: Error) => {
    const errorStr = error.message.toLowerCase();

    // Clear orphaned port config
    const baseUrl = localStorage.getItem('finance_base_url');
    if (baseUrl && baseUrl.includes(':8000')) {
      console.warn('[Phoenix] Clearing orphaned :8000 config');
      localStorage.removeItem('finance_base_url');
    }

    // Database corruption recovery
    if (errorStr.includes('dexie') || errorStr.includes('database')) {
      console.warn('[Phoenix] Database corruption detected, initiating recovery...');
      db.delete().then(() => {
        console.log('[Phoenix] Database deleted, reloading...');
        this.startCountdown();
      }).catch(() => {
        this.startCountdown();
      });
    } else {
      this.startCountdown();
    }
  };

  startCountdown = () => {
    let count = 3;
    this.setState({ countdown: count });

    const interval = setInterval(() => {
      count--;
      this.setState({ countdown: count });

      if (count <= 0) {
        clearInterval(interval)
        window.location.reload(true);
      }
    }, 1000);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              Reparando sistema automáticamente...
            </h1>

            <p className="text-slate-400 mb-6">
              {this.state.errorType === 'database' && 'Detectamos corrupción en la base de datos local. Recuperando...'}
              {this.state.errorType === 'config' && 'Corrigiendo configuración de red...'}
              {this.state.errorType === 'general' && 'Restaurando estabilidad del sistema...'}
            </p>

            <div className="text-4xl font-bold text-purple-400 mb-2">
              {this.state.countdown}
            </div>

            <p className="text-slate-500 text-sm">
              Recargando en {this.state.countdown} segundo{this.state.countdown !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
