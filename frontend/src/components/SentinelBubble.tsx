import Modal from './common/Modal';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Activity, TrendingDown, AlertCircle, X, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
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

const getHealthBadgeColor = (score: number) => {
  if (score >= 80) return 'bg-success';
  if (score >= 50) return 'bg-warning';
  return 'bg-danger';
};

const getConcernIcon = (index: number) => {
  if (index === 0) return <Activity className="w-4 h-4 text-accent-strong" />;
  if (index === 1) return <Shield className="w-4 h-4 text-accent-strong" />;
  return <TrendingDown className="w-4 h-4 text-accent-strong" />;
};

export const SentinelBubble: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedAlertTimestamp, setDismissedAlertTimestamp] = useState<string | null>(null);
  // El Sentinel se monta una sola vez en Layout, envolviendo todas las rutas de la app.
  // Sin este flag, useQuery dispararía la llamada a Gemini al abrir la app,
  // antes de que el usuario interactúe con el Sentinel en absoluto.
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);

  const { data: health, isLoading, error } = useQuery({
    queryKey: ['sentinel-health'],
    queryFn: async () => {
      const response = await api.get<SentinelHealth>('/api/ai-sentinel/health');
      return response.data;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
    enabled: hasOpenedOnce,
  });

  const hasNewAlert = Boolean(
    health && health.health_score < 70 && health.timestamp !== dismissedAlertTimestamp,
  );

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-danger';
  };

  return (
    <>
      {/* Floating Bubble */}
      <div className="app-sentinel-anchor">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (!hasOpenedOnce) setHasOpenedOnce(true);
            setIsOpen(!isOpen);
            if (health) setDismissedAlertTimestamp(health.timestamp);
          }}
          aria-label={isOpen ? 'Cerrar Centinela financiero' : 'Abrir Centinela financiero'}
          className={`app-sentinel-button relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl  border transition-all ${
            isOpen
              ? 'bg-surface border-line text-primary'
              : 'bg-accent-soft border-line text-primary'
          }`}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Shield className="w-6 h-6" />}

          {hasNewAlert && !isOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger rounded-full border-2 border-line animate-pulse" />
          )}

          {!isLoading && health && !isOpen && (
            <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full text-xs font-black border border-line ${getHealthBadgeColor(health.health_score)}`}>
              {health.health_score}
            </div>
          )}
        </motion.button>

        {/* Expanded Panel */}
        <AnimatePresence>
          {isOpen && (
            <Modal label="Centinela financiero" onClose={() => setIsOpen(false)} className="app-sentinel-dialog">
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="app-sentinel-panel fixed top-4 bottom-4 right-4 w-full sm:w-[420px] z-[60] bg-surface  rounded-2xl border border-line  flex flex-col overflow-hidden"
              >
              {/* Header */}
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                className="relative p-6 pb-4 flex items-center justify-between border-b border-line bg-surface-soft"
              >
                <div className="flex items-center gap-3">
                  <motion.div

                    transition={{ duration: 4, repeat: Infinity }}
                    className="w-8 h-8 rounded-xl bg-accent-soft flex items-center justify-center border border-line"
                  >
                    <Shield className="w-4 h-4 text-accent-strong" />
                  </motion.div>
                  <h3 id="sentinel-panel-title" className="text-xs font-black text-primary uppercase tracking-[0.4em]">Centinela financiero</h3>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar Centinela financiero"
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-surface-soft rounded-xl transition-all text-muted hover:text-primary"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>

              <div className="relative flex-1 overflow-y-auto scrollbar-hide">
                {isLoading && (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                    <motion.div
                      animate={{
                        scale: [1, 1.1, 1],
                        rotate: [0, 180, 360]
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="mb-8"
                    >
                      <RefreshCw className="w-16 h-16 text-accent-strong" />
                    </motion.div>
                    <h4 className="text-xl font-bold text-primary mb-2 font-mono uppercase tracking-widest">Sincronizando</h4>
                    <p className="text-xs text-muted uppercase tracking-[0.4em] font-black animate-pulse">Consultando Núcleo de Inteligencia</p>
                  </div>
                )}
                {!isLoading && error && (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center text-danger">
                    <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-sm font-bold uppercase tracking-widest font-mono">Enlace Interrumpido</p>
                  </div>
                )}
                {!isLoading && !error && health && (
                  <motion.div
                    variants={{
                      show: { transition: { staggerChildren: 0.15 } }
                    }}
                    initial="hidden"
                    animate="show"
                    className="px-8 py-10 space-y-12"
                  >
                    {/* Executive Summary Section */}
                    <motion.div variants={{ hidden: { opacity: 0, x: 20 }, show: { opacity: 1, x: 0 } }} className="flex gap-8 items-center">
                      <div className="relative w-20 h-20 flex-shrink-0">
                        <div className={`absolute inset-0 rounded-full  opacity-40 animate-pulse ${getHealthBadgeColor(health.health_score)}`} />
                        <svg className="w-full h-full transform -rotate-90 relative z-10">
                          <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-muted" />
                          <motion.circle
                            cx="50%"
                            cy="50%"
                            r="45%"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            strokeDasharray="283"
                            initial={false}
                            animate={{ strokeDashoffset: 283 * (1 - health.health_score / 100) }}
                            className={getHealthColor(health.health_score)}
                            strokeLinecap="round"
                            transition={{ duration: 2, ease: "circOut" }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                          <motion.span
                            initial={false}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                            className={`text-2xl font-black ${getHealthColor(health.health_score)} tracking-tight`}
                          >
                            {health.health_score}
                          </motion.span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-black text-muted uppercase tracking-[0.3em] mb-2 block font-mono">Status // Scan_Ready</span>
                        <motion.h2
                          initial={false}
                          animate={{ filter: "blur(0px)", opacity: 1 }}
                          transition={{ duration: 1, delay: 0.3 }}
                          className="text-sm font-semibold text-primary leading-relaxed tracking-wide"
                        >
                          {health.status_summary}
                        </motion.h2>
                      </div>
                    </motion.div>

                    {/* Audit Findings */}
                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-6">
                      <h4 className="text-xs font-black text-muted uppercase tracking-[0.5em] flex items-center gap-4 font-mono">
                        Análisis de Auditoría
                        <div className="flex-1 h-[1px] bg-surface-soft  " />
                      </h4>
                      <div className="space-y-5">
                        {health.top_concerns.map((concern, idx) => (
                          <motion.div
                            key={concern}
                            whileHover={{ x: 5 }}
                            className="flex gap-5 items-start group cursor-default"
                          >
                            <div className="w-8 h-8 rounded-xl bg-white/[0.03] flex items-center justify-center flex-shrink-0 border border-line group-hover:bg-accent-soft group-hover:border-line transition-all duration-300 shadow-inner">
                              {getConcernIcon(idx)}
                            </div>
                            <p className="text-[13px] text-muted leading-relaxed font-medium group-hover:text-primary transition-colors">
                              {concern}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>

                    {/* Burn Rate Alarms */}
                    {health.alarmas_ritmo_gasto && health.alarmas_ritmo_gasto.length > 0 && (
                      <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-6">
                        <h4 className="text-xs font-black text-danger uppercase tracking-[0.5em] flex items-center gap-4 font-mono">
                          Ritmo de Gasto Excedido
                          <div className="flex-1 h-[1px] bg-surface-soft  " />
                        </h4>
                        <div className="space-y-4">
                        {health.alarmas_ritmo_gasto.map((alarm) => {
                          const overExpectedPercent = alarm.expected > 0
                            ? Math.round(((alarm.spent - alarm.expected) / alarm.expected) * 100)
                            : null;
                          return (
                            <div key={`${alarm.category}-${alarm.pacing_status}`} className="bg-danger-soft border border-line rounded-2xl p-4">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-black text-danger uppercase tracking-widest">{alarm.category}</span>
                                <span className="text-xs font-mono text-danger">
                                  {overExpectedPercent === null ? 'Por encima del límite' : `+${overExpectedPercent}% vs esperado`}
                                </span>
                              </div>
                              <div className="h-1.5 bg-canvas rounded-full overflow-hidden mb-2">
                                <div className="h-full bg-danger w-full animate-pulse" />
                              </div>
                              <p className="text-xs text-muted font-medium leading-tight">
                                Has gastado <span className="text-danger">${alarm.spent.toFixed(2)}</span>. El sistema esperaba <span className="text-muted">${alarm.expected.toFixed(2)}</span> para hoy.
                              </p>
                            </div>
                          );
                        })}
                        </div>
                      </motion.div>
                    )}

                    {/* Critical Alerts */}
                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-6">
                      <h4 className="text-xs font-black text-muted uppercase tracking-[0.5em] flex items-center gap-4 font-mono">
                        Alertas del Sistema
                        <div className="flex-1 h-[1px] bg-surface-soft  " />
                      </h4>
                      <div className="space-y-4">
                        {health.warnings.map((warning) => (
                          <motion.div
                            key={`${warning.level}-${warning.message}`}
                            whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.03)" }}
                            className={`p-5 rounded-2xl border transition-all relative overflow-hidden ${
                              warning.level === 'warning'
                                ? 'bg-red-500/[0.02] border-line'
                                : 'bg-indigo-500/[0.02] border-line'
                            }`}
                          >
                            <div className="flex items-start gap-4 relative z-10">
                              <div className={`p-2.5 rounded-xl ${warning.level === 'warning' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-strong'}`}>
                                {warning.level === 'warning' ? <AlertCircle className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                              </div>
                              <p className="text-[13px] font-bold text-muted leading-snug">{warning.message}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>

                    {/* Priority Action Card */}
                    <motion.div
                      variants={{ hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } }}
                      className="pt-6"
                    >
                      <div className="relative p-10 bg-surface rounded-2xl shadow-2xl overflow-hidden group border border-line">
                        {/* Animated Border Glow */}
                        <motion.div
                          animate={{
                            opacity: [0.3, 0.6, 0.3],
                          }}
                          transition={{ duration: 4, repeat: Infinity }}
                          className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(99,102,241,0.2),transparent)] animate-spin-slow"
                          style={{ animationDuration: '10s' }}
                        />

                        <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-5">
                            <div className="w-2 h-2 rounded-full bg-accent-strong animate-ping" />
                            <span className="text-xs font-black text-accent-strong uppercase tracking-[0.4em] font-mono">Protocolo Prioritario</span>
                          </div>
                          <p className="text-2xl font-black text-primary leading-tight tracking-tight">
                            {health.recommended_action}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </div>

              {/* High-Fidelity Footer */}
              <motion.div
                initial={false}
                animate={{ opacity: 1 }}
                className="p-8 bg-surface-soft border-t border-line flex justify-between items-center"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full  animate-pulse ${health?.analysis_source === 'heuristic' ? 'bg-warning' : 'bg-success'}`} />
                  <p className="text-xs text-muted font-black uppercase tracking-[0.4em] font-mono">
                    {health?.analysis_source === 'heuristic' ? 'Análisis basado en reglas' : 'Análisis con IA'}
                  </p>
                </div>
                <div className="flex gap-4 items-center">

                  <p className="text-xs text-muted font-medium font-mono">{health ? new Date(health.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}</p>
                </div>
              </motion.div>
            </motion.div>
            </Modal>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
