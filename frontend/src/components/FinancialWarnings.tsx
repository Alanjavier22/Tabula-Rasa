import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';
import api from '../services/api';

interface FinancialWarning {
  level: 'warning' | 'info' | 'success';
  message: string;
}

interface FinancialWarningsResponse {
  warnings: FinancialWarning[];
}

export const FinancialWarnings: React.FC = () => {
  const [warnings, setWarnings] = useState<FinancialWarning[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWarnings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<FinancialWarningsResponse>('/ai/financial-warnings');
      setWarnings(response.data.warnings || []);
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Error al cargar alertas financieras';
      setError(detail);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWarnings();
  }, []);

  const getIcon = (level: string) => {
    switch (level) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'info':
        return <Info className="w-5 h-5" />;
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getColors = (level: string) => {
    switch (level) {
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
      case 'info':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'success':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      default:
        return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          <span className="text-slate-400 text-sm">Analizando situación financiera...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
          <button
            onClick={fetchWarnings}
            className="text-slate-400 hover:text-white transition-colors"
            title="Reintentar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (warnings.length === 0) {
    return null; // No warnings to show
  }

  return (
    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Alertas Financieras
        </h3>
        <button
          onClick={fetchWarnings}
          className="text-slate-400 hover:text-white transition-colors"
          title="Refrescar Análisis"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <AnimatePresence mode="wait">
        <div className="space-y-2">
          {warnings.map((warning, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ delay: index * 0.1 }}
              className={`flex items-start gap-3 p-3 rounded-lg border ${getColors(warning.level)}`}
            >
              <div className="mt-0.5">{getIcon(warning.level)}</div>
              <p className="text-sm flex-1">{warning.message}</p>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
};
