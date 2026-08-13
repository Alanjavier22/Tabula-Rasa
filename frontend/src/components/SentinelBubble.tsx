import React, { useState, useEffect, useMemo } from 'react';
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
  alarmas_ritmo_gasto?: SentinelBurnAlarm[];
  timestamp: string;
}

export const SentinelBubble: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewAlert, setHasNewAlert] = useState(false);

  const { data: health, isLoading, error } = useQuery({
    queryKey: ['sentinel-health'],
    queryFn: async () => {
      const response = await api.get<SentinelHealth>('/api/ai-sentinel/health');
      return response.data;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (health && health.health_score < 70) {
      setHasNewAlert(true);
    }
  }, [health]);

  // Posiciones/duraciones de las partículas flotantes generadas una sola vez al montar,
  // no en cada render: si se recalculan con Math.random() directo en el JSX, cada
  // refetch de React Query (o cualquier otro re-render mientras el panel está abierto)
  // hace que las partículas salten a posiciones nuevas en vez de animarse continuas.
  /* eslint-disable react-hooks/purity -- Math.random es intencional (posiciones decorativas); el useMemo ya evita que cambien entre renders */
  const particles = useMemo(() => (
    [...Array(6)].map(() => ({
      x: Math.random() * 20 - 10,
      duration: 10 + Math.random() * 10,
      left: Math.random() * 100,
      top: Math.random() * 100,
    }))
  ), []);
  /* eslint-enable react-hooks/purity */

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <>
      {/* Floating Bubble */}
      <div className="fixed bottom-20 right-6 lg:bottom-8 lg:right-8 z-50">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setIsOpen(!isOpen);
            setHasNewAlert(false);
          }}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-xl border transition-all ${
            isOpen 
              ? 'bg-slate-800 border-slate-700 text-white' 
              : 'bg-indigo-600/90 border-indigo-500/50 text-white'
          }`}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
          
          {hasNewAlert && !isOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
          )}
          
          {!isLoading && health && !isOpen && (
            <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-black border border-slate-900 ${
              health.health_score >= 80 ? 'bg-emerald-500' : health.health_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
            }`}>
              {health.health_score}
            </div>
          )}
        </motion.button>

        {/* Expanded Panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9, transformOrigin: 'bottom right' }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="fixed top-4 bottom-4 right-4 w-full sm:w-[420px] z-[60] bg-[#0c101b]/85 backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-[-20px_0_100px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
            >
              {/* 1. Noise Texture Overlay */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3C%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

              {/* 2. Floating Data Particles */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
                {particles.map((p, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      y: [0, -100, 0],
                      x: [0, p.x, 0],
                      opacity: [0, 0.5, 0],
                    }}
                    transition={{
                      duration: p.duration,
                      repeat: Infinity,
                      delay: i * 2,
                    }}
                    className="absolute w-1 h-1 bg-indigo-500 rounded-full"
                    style={{
                      left: `${p.left}%`,
                      top: `${p.top}%`,
                    }}
                  />
                ))}
              </div>

              {/* Header */}
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative p-6 pb-4 flex items-center justify-between border-b border-white/5 bg-white/[0.02]"
              >
                <div className="flex items-center gap-3">
                  <motion.div 
                    animate={{ 
                      boxShadow: ["0 0 0px rgba(99,102,241,0)", "0 0 20px rgba(99,102,241,0.4)", "0 0 0px rgba(99,102,241,0)"],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30"
                  >
                    <Shield className="w-4 h-4 text-indigo-400" />
                  </motion.div>
                  <h3 className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Centinela: Núcleo de Inteligencia</h3>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-500 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>

              <div className="relative flex-1 overflow-y-auto scrollbar-hide">
                {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                    <motion.div
                      animate={{ 
                        scale: [1, 1.1, 1],
                        rotate: [0, 180, 360]
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="mb-8"
                    >
                      <RefreshCw className="w-16 h-16 text-indigo-500/20" />
                    </motion.div>
                    <h4 className="text-xl font-bold text-white mb-2 font-mono uppercase tracking-widest">Sincronizando</h4>
                    <p className="text-[10px] text-slate-500 uppercase tracking-[0.4em] font-black animate-pulse">Consultando Núcleo de Inteligencia</p>
                  </div>
                ) : error ? (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center text-red-400/60">
                    <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-sm font-bold uppercase tracking-widest font-mono">Enlace Interrumpido</p>
                  </div>
                ) : health && (
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
                        <div className={`absolute inset-0 rounded-full blur-2xl opacity-40 animate-pulse ${
                          health.health_score >= 80 ? 'bg-emerald-500' : health.health_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`} />
                        <svg className="w-full h-full transform -rotate-90 relative z-10">
                          <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-900" />
                          <motion.circle
                            cx="50%"
                            cy="50%"
                            r="45%"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            strokeDasharray="283"
                            initial={{ strokeDashoffset: 283 }}
                            animate={{ strokeDashoffset: 283 * (1 - health.health_score / 100) }}
                            className={getHealthColor(health.health_score)}
                            strokeLinecap="round"
                            transition={{ duration: 2, ease: "circOut" }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                          <motion.span 
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                            className={`text-2xl font-black ${getHealthColor(health.health_score)} tracking-tighter`}
                          >
                            {health.health_score}
                          </motion.span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2 block font-mono">Status // Scan_Ready</span>
                        <motion.h2 
                          initial={{ filter: "blur(10px)", opacity: 0 }}
                          animate={{ filter: "blur(0px)", opacity: 1 }}
                          transition={{ duration: 1, delay: 0.3 }}
                          className="text-sm font-semibold text-slate-200 leading-relaxed tracking-wide"
                        >
                          {health.status_summary}
                        </motion.h2>
                      </div>
                    </motion.div>

                    {/* Audit Findings */}
                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-6">
                      <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.5em] flex items-center gap-4 font-mono">
                        Análisis de Auditoría
                        <div className="flex-1 h-[1px] bg-gradient-to-r from-white/5 to-transparent" />
                      </h4>
                      <div className="space-y-5">
                        {health.top_concerns.map((concern, idx) => (
                          <motion.div 
                            key={idx} 
                            whileHover={{ x: 5 }}
                            className="flex gap-5 items-start group cursor-default"
                          >
                            <div className="w-8 h-8 rounded-xl bg-white/[0.03] flex items-center justify-center flex-shrink-0 border border-white/5 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/40 transition-all duration-300 shadow-inner">
                              {idx === 0 ? <Activity className="w-4 h-4 text-indigo-400" /> : idx === 1 ? <Shield className="w-4 h-4 text-indigo-400" /> : <TrendingDown className="w-4 h-4 text-indigo-400" />}
                            </div>
                            <p className="text-[13px] text-slate-400 leading-relaxed font-medium group-hover:text-slate-100 transition-colors">
                              {concern}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>

                    {/* Burn Rate Alarms */}
                    {health.alarmas_ritmo_gasto && health.alarmas_ritmo_gasto.length > 0 && (
                      <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-6">
                        <h4 className="text-[9px] font-black text-rose-500 uppercase tracking-[0.5em] flex items-center gap-4 font-mono">
                          Ritmo de Gasto Excedido
                          <div className="flex-1 h-[1px] bg-gradient-to-r from-rose-500/20 to-transparent" />
                        </h4>
                        <div className="space-y-4">
                          {health.alarmas_ritmo_gasto.map((alarm, idx) => (
                            <div key={idx} className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-black text-rose-400 uppercase tracking-widest">{alarm.category}</span>
                                <span className="text-[10px] font-mono text-rose-300/50">+{Math.round(((alarm.spent - alarm.expected) / alarm.expected) * 100)}% vs esperado</span>
                              </div>
                              <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden mb-2">
                                <div className="h-full bg-rose-500 w-full animate-pulse" />
                              </div>
                              <p className="text-[10px] text-slate-400 font-medium leading-tight">
                                Has gastado <span className="text-rose-300">${alarm.spent.toFixed(2)}</span>. El sistema esperaba <span className="text-slate-300">${alarm.expected.toFixed(2)}</span> para hoy.
                              </p>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Critical Alerts */}
                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="space-y-6">
                      <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.5em] flex items-center gap-4 font-mono">
                        Alertas del Sistema
                        <div className="flex-1 h-[1px] bg-gradient-to-r from-white/5 to-transparent" />
                      </h4>
                      <div className="space-y-4">
                        {health.warnings.map((warning, idx) => (
                          <motion.div 
                            key={idx} 
                            whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.03)" }}
                            className={`p-5 rounded-[2rem] border transition-all relative overflow-hidden ${
                              warning.level === 'warning' 
                                ? 'bg-red-500/[0.02] border-red-500/10' 
                                : 'bg-indigo-500/[0.02] border-indigo-500/10'
                            }`}
                          >
                            <div className="flex items-start gap-4 relative z-10">
                              <div className={`p-2.5 rounded-xl ${warning.level === 'warning' ? 'bg-red-500/10 text-red-500' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                {warning.level === 'warning' ? <AlertCircle className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                              </div>
                              <p className="text-[13px] font-bold text-slate-300 leading-snug">{warning.message}</p>
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
                      <div className="relative p-10 bg-[#121624] rounded-[3rem] shadow-2xl overflow-hidden group border border-white/5">
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
                            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] font-mono">Protocolo Prioritario</span>
                          </div>
                          <p className="text-2xl font-black text-white leading-tight tracking-tighter">
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-8 bg-black/20 border-t border-white/5 flex justify-between items-center"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-pulse" />
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] font-mono">Oracle Active</p>
                </div>
                <div className="flex gap-4 items-center">
                  <span className="text-[9px] text-slate-700 font-bold uppercase tracking-widest px-3 py-1 bg-white/5 rounded-full border border-white/5">V.3.2-∞</span>
                  <p className="text-[10px] text-slate-600 font-medium font-mono">{health ? new Date(health.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
