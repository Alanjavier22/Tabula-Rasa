import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, Loader2, AlertCircle, TrendingUp } from 'lucide-react';

interface AIInsightsSectionProps {
  insights: string[] | null;
  aiAlerts: string[];
  aiPatterns: string[];
  isPending: boolean;
  onRefresh: () => void;
}

function analysisAction(isPending: boolean, hasAnalysis: boolean) {
  if (isPending) return { Icon: Loader2, label: 'Analizando…', spinning: true };
  if (hasAnalysis) return { Icon: RefreshCw, label: 'Actualizar análisis', spinning: false };
  return { Icon: Sparkles, label: 'Generar análisis', spinning: false };
}

function AnalysisEmptyState({ isPending, hasAnalysis }: Readonly<{ isPending: boolean; hasAnalysis: boolean }>) {
  if (isPending) return (
    <div className="ai-insights-empty">
      <Loader2 className="w-5 h-5 animate-spin text-accent-strong" aria-hidden="true" />
      <output className="text-muted text-sm">Preparando una lectura de tus datos financieros…</output>
    </div>
  );
  return (
    <div className="ai-insights-empty">
      <div className="ai-insights-empty-icon"><Sparkles className="w-5 h-5 text-accent-strong" aria-hidden="true" /></div>
      <h3 className="text-primary font-semibold">{hasAnalysis ? 'Sin hallazgos para destacar' : 'Análisis bajo demanda'}</h3>
      <p className="text-muted text-sm text-center max-w-md">{hasAnalysis
        ? 'La última lectura no encontró recomendaciones o alertas relevantes.'
        : 'Genera una lectura asistida cuando quieras revisar patrones de gasto, anomalías y recomendaciones sobre tu flujo mensual.'}</p>
    </div>
  );
}

const AIInsightsSection = ({
  insights,
  aiAlerts,
  aiPatterns,
  isPending,
  onRefresh,
}: AIInsightsSectionProps) => {
  const hasAnalysis = insights !== null;
  const visibleInsights = insights ?? [];
  const hasResults = Boolean(
    visibleInsights.length || aiAlerts.length || aiPatterns.length,
  );
  const action = analysisAction(isPending, hasAnalysis);

  return (
    <div className="ai-insights-panel">
      <div className="ai-insights-head">
        <div>
          <span className="ai-insights-kicker">Lectura asistida</span>
          <h2 className="app-section-title">Análisis financiero con IA</h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isPending}
          className={`app-btn ${!hasAnalysis ? 'app-btn-primary' : ''}`}
        >
          <action.Icon className={`w-4 h-4 ${action.spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
          {action.label}
        </button>
      </div>

      {hasResults ? (
        <div className="ai-insights-grid">
          <AnimatePresence>
            {visibleInsights.map((insight, index) => (
              <motion.article
                key={insight}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="ai-insight-card"
              >
                <span className="ai-insight-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p>{insight}</p>
              </motion.article>
            ))}
          </AnimatePresence>

          {aiAlerts.map((alert) => (
            <motion.article
              key={`alert-${alert}`}
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              className="ai-insight-card ai-insight-card-danger"
            >
              <span className="ai-insight-badge">
                <AlertCircle className="w-4 h-4" aria-hidden="true" />
                Riesgo detectado
              </span>
              <p>{alert}</p>
            </motion.article>
          ))}

          {aiPatterns.map((pattern) => (
            <motion.article
              key={`pattern-${pattern}`}
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              className="ai-insight-card ai-insight-card-warning"
            >
              <span className="ai-insight-badge">
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
                Patrón de gasto
              </span>
              <p>{pattern}</p>
            </motion.article>
          ))}
        </div>
      ) : (
        <AnalysisEmptyState isPending={isPending} hasAnalysis={hasAnalysis} />
      )}
    </div>
  );
};

export default AIInsightsSection;
