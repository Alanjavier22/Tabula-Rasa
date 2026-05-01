import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { phoenixHardReset } from '../../db/db';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorType: 'general' | 'database' | 'config';
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorType: 'general'
    };
  }

  componentDidMount() {
    // FASE PHOENIX GLOBAL: Listen for external fatal error events from background services
    window.addEventListener('phoenix-fatal-error', this.handleExternalFatalError);
  }

  componentWillUnmount() {
    window.removeEventListener('phoenix-fatal-error', this.handleExternalFatalError);
  }

  handleExternalFatalError = (event: Event) => {
    const customEvent = event as CustomEvent<Error>;
    console.error('[Phoenix Global] External fatal error received:', customEvent.detail);
    this.setState({
      hasError: true,
      error: customEvent.detail,
      errorType: 'database'
    });
  };

  static getDerivedStateFromError(error: Error): State {
    const errorStr = error.message.toLowerCase();
    let errorType: State['errorType'] = 'general';
    
    if (errorStr.includes('dexie') || errorStr.includes('database') || errorStr.includes('indexeddb')) {
      errorType = 'database';
    } else if (errorStr.includes('config') || errorStr.includes('base_url') || errorStr.includes('8000')) {
      errorType = 'config';
    }

    return { hasError: true, error, errorType };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Phoenix Local Healer] Error caught:', error, errorInfo);
  }

  handleRepairDatabase = async () => {
    console.warn('[Phoenix Local Healer] Usuario solicitó reparación manual de IndexedDB');
    await phoenixHardReset();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isDexieError = this.state.error?.message.toLowerCase().includes('dexie');
      
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
              {isDexieError ? 'Error en Base de Datos Local' : 'Error del Sistema'}
            </h1>

            <p className="text-slate-400 mb-6">
              {this.state.errorType === 'database' && !isDexieError && 'Detectamos corrupción en la base de datos local. Recuperando...'}
              {this.state.errorType === 'config' && 'Corrigiendo configuración de red...'}
              {this.state.errorType === 'general' && 'Restaurando estabilidad del sistema...'}
              {isDexieError && 'Detectamos un error crítico en IndexedDB (Dexie). Esto puede ocurrir por cambios de esquema o corrupción de caché.'}
            </p>

            {isDexieError ? (
              <button
                onClick={this.handleRepairDatabase}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors mb-3"
              >
                Reparar Base de Datos Local
              </button>
            ) : (
              <button
                onClick={this.handleReload}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Recargar Página
              </button>
            )}

            {isDexieError && (
              <p className="text-slate-500 text-xs mt-3">
                ⚠️ Esto eliminará todos los datos locales no sincronizados
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
