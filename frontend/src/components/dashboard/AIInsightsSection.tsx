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
        <h2 className="text-xl font-bold text-primary flex items-center gap-2">
          <div className="p-2 rounded-lg bg-accent-soft">
            <Sparkles className="w-5 h-5 text-accent-strong" />
          </div>
          Análisis financiero
        </h2>
        <button
          onClick={onRefresh}
          disabled={isPending}
          className={`flex items-center gap-2 px-5 py-2 rounded-full text-primary text-sm font-bold transition-all border ${
            isPending
              ? 'bg-surface border-line opacity-70 animate-pulse'
              : 'bg-canvas border-line hover:bg-accent-soft hover:border-line'
          }`}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-accent-strong" />
          ) : (
            <RefreshCw className="w-4 h-4 text-accent-strong" />
          )}
          {isPending ? 'Consultando IA...' : 'Refrescar Análisis'}
        </button>
      </div>

      {insights ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {insights.map((insight, index) => (
              <motion.div
                key={insight}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="group bg-surface  rounded-2xl border border-line p-5 hover:border-line transition-all hover:bg-surface shadow-lg"
              >
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center text-accent-strong text-sm font-bold border border-line group-hover:bg-accent-soft transition-all">
                    {index + 1}
                  </div>
                  <p className="text-primary text-sm leading-relaxed">{insight}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Anomaly & Patterns merged as cards */}
          {aiAlerts.map((alert) => (
            <motion.div
              key={`alert-${alert}`}
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-danger-soft  rounded-2xl border border-line p-5"
            >
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-danger-soft flex items-center justify-center text-danger">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-danger text-xs font-bold uppercase tracking-wider mb-1">Riesgo Detectado</h4>
                  <p className="text-danger text-sm leading-relaxed">{alert}</p>
                </div>
              </div>
            </motion.div>
          ))}

          {aiPatterns.map((pattern) => (
            <motion.div
              key={`pattern-${pattern}`}
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-warning-soft  rounded-2xl border border-line p-5"
            >
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-warning-soft flex items-center justify-center text-warning">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-warning text-xs font-bold uppercase tracking-wider mb-1">Patrón de Gasto</h4>
                  <p className="text-warning text-sm leading-relaxed">{pattern}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : !isPending && (
        <div className="flex flex-col items-center justify-center py-12 px-4 bg-surface rounded-3xl border border-dashed border-line">
          <div className="w-16 h-16 bg-accent-soft rounded-full flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-accent-strong" />
          </div>
          <h3 className="text-primary font-semibold mb-1">Análisis pendiente</h3>
          <p className="text-muted text-sm text-center max-w-xs">Haz clic en el botón para que la IA escanee tu situación actual y genere estrategias personalizadas.</p>
        </div>
      )}
    </div>
  );
};

export default AIInsightsSection;
