import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

interface FinancialWarning {
  level: 'warning' | 'info' | 'success';
  message: string;
}

interface FinancialWarningsResponse {
  warnings: FinancialWarning[];
}


export const FinancialWarnings: React.FC = () => {
  const query = useQuery({
    queryKey: ['financial-warnings'],
    queryFn: async () => {
      const response = await api.get<FinancialWarningsResponse>('/api/ai/financial-warnings');
      return response.data.warnings || [];
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const handleRefresh = () => {
    query.refetch();
  };

  // Don't render anything while loading initially
  if (query.isLoading && !query.data) {
    return (
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          <span className="text-slate-400 text-sm">Analizando situación financiera...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (query.error && !query.data) {
    return (
      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400 text-sm">
              {(query.error as any)?.response?.data?.detail || 'Error al cargar alertas financieras'}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            className="text-slate-400 hover:text-white transition-colors"
            title="Reintentar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Don't render if no warnings
  if (!query.data || query.data.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
          Alertas Financieras
        </h3>
        <button
          onClick={handleRefresh}
          className="text-slate-400 hover:text-white transition-colors"
          title="Refrescar Análisis"
          disabled={query.isFetching}
        >
          <RefreshCw className={`w-4 h-4 ${query.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {query.isFetching && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      )}

      {!query.isFetching && (
        <AnimatePresence mode="wait">
          <div className="space-y-2">
            {query.data.map((warning, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  warning.level === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : warning.level === 'info'
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}
              >
                {warning.level === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                ) : warning.level === 'info' ? (
                  <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                )}
                <p className={`text-sm ${
                  warning.level === 'warning'
                    ? 'text-amber-400'
                    : warning.level === 'info'
                    ? 'text-blue-400'
                    : 'text-emerald-400'
                }`}>
                  {warning.message}
                </p>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
};
