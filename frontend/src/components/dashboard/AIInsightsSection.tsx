import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, Loader2, AlertCircle, TrendingUp } from 'lucide-react';

interface AIInsightsSectionProps {
  insights: string[] | null;
  aiAlerts: string[];
  aiPatterns: string[];
  isPending: boolean;
  onRefresh: () => void;
}

const AIInsightsSection = ({ insights, aiAlerts, aiPatterns, isPending, onRefresh }: AIInsightsSectionProps) => {
  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          Insights Estratégicos
        </h2>
        <button
          onClick={onRefresh}
          disabled={isPending}
          className={`flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-bold transition-all border ${
            isPending
              ? 'bg-slate-800 border-slate-700 opacity-70 animate-pulse'
              : 'bg-slate-900/50 border-purple-500/50 hover:bg-purple-500/10 hover:border-purple-400'
          }`}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          ) : (
            <RefreshCw className="w-4 h-4 text-purple-400" />
          )}
          {isPending ? 'Consultando IA...' : 'Refrescar Análisis'}
        </button>
      </div>

      {insights ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {insights.map((insight, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="group bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-5 hover:border-purple-500/30 transition-all hover:bg-slate-800/50 shadow-lg"
              >
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 text-sm font-bold border border-purple-500/20 group-hover:bg-purple-500/20 transition-all">
                    {index + 1}
                  </div>
                  <p className="text-slate-200 text-sm leading-relaxed">{insight}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Anomaly & Patterns merged as cards */}
          {aiAlerts.map((alert, i) => (
            <motion.div
              key={`alert-${i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-500/5 backdrop-blur-xl rounded-2xl border border-red-500/20 p-5"
            >
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-red-400 text-xs font-bold uppercase tracking-wider mb-1">Riesgo Detectado</h4>
                  <p className="text-red-200 text-sm leading-relaxed">{alert}</p>
                </div>
              </div>
            </motion.div>
          ))}

          {aiPatterns.map((pattern, i) => (
            <motion.div
              key={`pattern-${i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-amber-500/5 backdrop-blur-xl rounded-2xl border border-amber-500/20 p-5"
            >
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">Patrón de Gasto</h4>
                  <p className="text-amber-200 text-sm leading-relaxed">{pattern}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : !isPending && (
        <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
          <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-purple-400/50" />
          </div>
          <h3 className="text-white font-semibold mb-1">Análisis IA Pendiente</h3>
          <p className="text-slate-400 text-sm text-center max-w-xs">Haz clic en el botón para que la IA escanee tu situación actual y genere estrategias personalizadas.</p>
        </div>
      )}
    </div>
  );
};

export default AIInsightsSection;
