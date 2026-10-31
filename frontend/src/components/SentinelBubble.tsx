import { useState } from 'react';
import { ShieldCheck, X, AlertCircle, Loader2, RefreshCw, Sparkles, Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Modal from './common/Modal';
import api from '../services/api';

interface SentinelWarning {
  level: 'warning' | 'info' | 'success';
  message: string;
}

interface SentinelBurnAlarm {
  category: string;
  spent: number;
  expected: number;
  remaining: number;
  pacing_status: string;
}

interface SentinelHealth {
  health_score: number;
  status_summary: string;
  top_concerns: string[];
  recommended_action: string;
  warnings: SentinelWarning[];
  alarmas_ritmo_gasto: SentinelBurnAlarm[];
  timestamp: string;
  analysis_source: 'gemini' | 'heuristic';
  ai_error?: string | null;
}

export const SentinelBubble = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const { data: health, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['sentinel-health'],
    queryFn: async () => (await api.get<SentinelHealth>('/api/ai-sentinel/health')).data,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    enabled: hasOpenedOnce,
  });

  const score = health?.health_score ?? 0;
  const scoreTone = score >= 80 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-danger';
  const scoreLabel = score >= 80 ? 'Margen saludable' : score >= 50 ? 'Atención moderada' : 'Riesgo de liquidez';
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <>
      <button
        type="button"
        className="app-sentinel-button"
        onClick={() => {
          setHasOpenedOnce(true);
          setIsOpen(true);
        }}
        aria-label="Abrir Guardián Centinela"
        title="Diagnóstico del Guardián Centinela"
      >
        <ShieldCheck aria-hidden="true" />
        <span className="app-sentinel-label">Centinela</span>
        {health && (
          <span className={`app-sentinel-score-pill ${scoreTone}`}>
            {health.health_score}
          </span>
        )}
      </button>

      {isOpen && (
        <Modal label="Guardián Centinela" onClose={() => setIsOpen(false)} className="app-sentinel-dialog">
          <section className="app-sentinel-panel">
            <header className="sentinel-header">
              <div>
                <span className="sentinel-kicker">Guardián financiero</span>
                <h2>Centinela</h2>
                <p>Diagnóstico de liquidez, obligaciones y ritmo de gasto.</p>
              </div>
              <div className="sentinel-header-actions">
                {health && (
                  <button
                    type="button"
                    className="app-icon-button"
                    aria-label="Actualizar diagnóstico"
                    title="Actualizar diagnóstico"
                    disabled={isFetching}
                    onClick={() => void refetch()}
                  >
                    <RefreshCw aria-hidden="true" className={isFetching ? 'animate-spin' : ''} />
                  </button>
                )}
                <button
                  type="button"
                  className="app-icon-button"
                  aria-label="Cerrar Centinela"
                  title="Cerrar"
                  onClick={() => setIsOpen(false)}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="sentinel-content">
              {isLoading && (
                <div role="status" className="sentinel-loading">
                  <Loader2 aria-hidden="true" />
                  <p>Evaluando saldos, obligaciones y ritmo de gasto…</p>
                </div>
              )}

              {!isLoading && error && (
                <div role="alert" className="sentinel-error">
                  <AlertCircle aria-hidden="true" />
                  <p>No se pudo completar el diagnóstico del Centinela. Inténtalo de nuevo.</p>
                  <button type="button" className="app-btn" onClick={() => void refetch()}>
                    Reintentar diagnóstico
                  </button>
                </div>
              )}

              {!isLoading && !error && health && (
                <>
                  <div className="sentinel-score-card">
                    <div className="sentinel-gauge" aria-hidden="true">
                      <svg viewBox="0 0 68 68">
                        <circle
                          cx="34"
                          cy="34"
                          r={radius}
                          fill="none"
                          stroke="var(--app-border)"
                          strokeWidth="5"
                        />
                        <circle
                          cx="34"
                          cy="34"
                          r={radius}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          className={scoreTone}
                          transform="rotate(-90 34 34)"
                        />
                      </svg>
                      <div className="sentinel-gauge-value">
                        <strong>{health.health_score}</strong>
                        <small>/100</small>
                      </div>
                    </div>
                    <div className="sentinel-score-copy">
                      <span className={`sentinel-status-badge ${scoreTone}`}>{scoreLabel}</span>
                      <p>{health.status_summary}</p>
                    </div>
                  </div>

                  {health.recommended_action && (
                    <section className="sentinel-recommendation">
                      <h3>
                        <Sparkles aria-hidden="true" />
                        Acción sugerida
                      </h3>
                      <p>{health.recommended_action}</p>
                    </section>
                  )}

                  {health.top_concerns.length > 0 && (
                    <section className="sentinel-section">
                      <h3>Puntos de atención</h3>
                      <ul className="sentinel-concern-list">
                        {health.top_concerns.map((concern) => (
                          <li key={concern}>{concern}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {health.alarmas_ritmo_gasto?.length > 0 && (
                    <section className="sentinel-section">
                      <h3>
                        <Flame aria-hidden="true" />
                        Ritmo de gasto frente a presupuesto
                      </h3>
                      <div className="sentinel-items">
                        {health.alarmas_ritmo_gasto.map((alarm) => {
                          const ratio = alarm.expected > 0 ? Math.min(100, Math.round((alarm.spent / alarm.expected) * 100)) : 100;
                          return (
                            <div className="sentinel-item" key={`${alarm.category}-${alarm.pacing_status}`}>
                              <div className="sentinel-item-head">
                                <strong>{alarm.category}</strong>
                                <span>
                                  ${alarm.spent.toFixed(2)} <small>de ${alarm.expected.toFixed(2)} esp.</small>
                                </span>
                              </div>
                              <div className="sentinel-item-bar" aria-hidden="true">
                                <div style={{ width: `${ratio}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {health.warnings.length > 0 && (
                    <section className="sentinel-section">
                      <h3>Avisos del periodo</h3>
                      <div className="sentinel-items">
                        {health.warnings.map((warning) => (
                          <div
                            className={`sentinel-item sentinel-warning-${warning.level}`}
                            key={`${warning.level}-${warning.message}`}
                          >
                            {warning.message}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>

            {health && (
              <footer className="sentinel-footer">
                <span>
                  {health.analysis_source === 'heuristic'
                    ? 'Cálculo local basado en reglas'
                    : 'Índice por reglas · lectura asistida por IA'}
                </span>
                <time dateTime={health.timestamp}>
                  {new Date(health.timestamp).toLocaleString('es-EC', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
              </footer>
            )}
          </section>
        </Modal>
      )}
    </>
  );
};
