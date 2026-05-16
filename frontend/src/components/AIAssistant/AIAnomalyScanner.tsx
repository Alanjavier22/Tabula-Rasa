import React, { useState, useEffect } from 'react';
import { CheckCircle, X, RefreshCw, ShieldAlert, Zap, Target, Search, Check, EyeOff, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AIAgentService } from '../../services/AIAgentService';
import type { AnomalyScanResult, ZombieSubscription } from '../../services/AIAgentService';
import { subscriptionsAPI } from '../../services/api';

interface AIAnomalyScannerProps {
  recentTransactions: any[];
  currentSubscriptions: any[];
  categories: any[];
  goals: any[];
  apiKey: string;
  onClose?: () => void;
}

export const AIAnomalyScanner: React.FC<AIAnomalyScannerProps> = ({
  recentTransactions,
  currentSubscriptions,
  categories,
  goals,
  apiKey,
  onClose,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<AnomalyScanResult | null>(null);
  const [syncedZombies, setSyncedZombies] = useState<number[]>([]);
  const [dismissedSpikes, setDismissedSpikes] = useState<number[]>([]);

  // Bloquear el scroll del body de fondo mientras el modal está abierto
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setResult(null);
    setSyncedZombies([]);
    setDismissedSpikes([]);
    try {
      const scanResult = await AIAgentService.scanForAnomalies(
        recentTransactions,
        currentSubscriptions,
        categories,
        goals,
        apiKey
      );
      setResult(scanResult);
    } catch (error: any) {
      console.error('Error scanning for anomalies:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddSubscription = async (zombie: ZombieSubscription, idx: number) => {
    if (syncedZombies.includes(idx)) return;
    try {
      await subscriptionsAPI.create({
        name: zombie.description,
        amount: zombie.estimated_amount,
        frequency: 'monthly',
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      setSyncedZombies(prev => [...prev, idx]);
    } catch (error) {
      console.error('Error adding subscription:', error);
    }
  };

  const dismissSpike = (idx: number) => {
    setDismissedSpikes(prev => [...prev, idx]);
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || categoryId;
  };

  // Calcular Score de Salud Financiera (basado en número de anomalías)
  const getHealthScore = () => {
    if (!result) return 100;
    const zombiesCount = result.zombie_subscriptions.length - syncedZombies.length;
    const spikesCount = result.spending_spikes.length - dismissedSpikes.length;
    const totalAnomalies = zombiesCount + spikesCount;
    return Math.max(0, 100 - totalAnomalies * 15);
  };

  const score = getHealthScore();
  
  // UX/UI Overhaul: Paletas de neón de alto contraste y fondos oscuros súper premium
  const scoreClasses = score > 80 
    ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]' 
    : score > 50 
      ? 'bg-amber-950/80 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]' 
      : 'bg-rose-950/80 border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative max-h-[95vh]"
    >
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
      
      <div className="relative flex items-center justify-between py-3.5 px-6 border-b border-white/5 shrink-0 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <ShieldAlert className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-tight leading-none">Auditoría <span className="text-amber-500">Forense IA</span></h2>
            <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.2em] mt-0.5">Motor de Detección Activa</p>
          </div>
        </div>
        
        {result && !isScanning && (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${scoreClasses} transition-all duration-500`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-wider">Score Salud: <strong>{score}%</strong></span>
          </div>
        )}

        {onClose && (
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-5 overflow-y-auto custom-scrollbar">
        {!result && !isScanning && (
          <div className="flex flex-col items-center text-center space-y-6 py-6 max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-amber-500/5 border border-amber-500/20 flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border border-amber-500/10 animate-ping"></div>
              <Search className="w-8 h-8 text-amber-500/60 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-white tracking-tight">Iniciar Escaneo de Salud</h3>
              <p className="text-slate-400 text-xs font-medium leading-relaxed">
                El auditor financiero digital buscará fugas silenciosas de dinero, picos inusuales y cobros duplicados en base a tu comportamiento histórico de 6 meses.
              </p>
            </div>
            <button
              onClick={handleScan}
              className="group relative w-full"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-600 to-yellow-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
              <div className="relative bg-gradient-to-r from-amber-600 to-yellow-600 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99]">
                <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-700" />
                Comenzar Auditoría
              </div>
            </button>
          </div>
        )}

        {isScanning && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="relative w-24 h-24">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-t-2 border-r-2 border-amber-500/40"
              ></motion.div>
              <div className="absolute inset-3 rounded-full border border-amber-500/10 animate-pulse bg-amber-500/5 flex items-center justify-center">
                <Target className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-white font-black text-sm tracking-tight uppercase">Auditando Cuentas y Tarjetas</p>
              <p className="text-slate-500 text-[10px] font-black animate-pulse tracking-widest uppercase">Buscando picos de gasto y suscripciones fantasmas...</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {result && !isScanning && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <div className="flex justify-between items-center bg-slate-800/40 border border-white/5 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                  <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Reporte Forense Listo</span>
                </div>
                <button
                  onClick={handleScan}
                  className="text-[9px] font-black text-amber-500 hover:text-amber-400 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Escanear de Nuevo
                </button>
              </div>

              {/* Caso de Éxito Absoluto */}
              {(result.zombie_subscriptions.length - syncedZombies.length <= 0) && 
               (result.spending_spikes.length - dismissedSpikes.length <= 0) ? (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-white tracking-tight">Cero Irregularidades Activas</h4>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed">¡Tus cuentas están perfectamente blindadas y saludables!</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Categoría: Suscripciones Zombie */}
                  {result.zombie_subscriptions.length > 0 && result.zombie_subscriptions.some((_, i) => !syncedZombies.includes(i)) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-4 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                          <h3 className="text-[9px] font-black text-emerald-400/80 uppercase tracking-widest">
                            Fugas: Suscripciones Zombie
                          </h3>
                        </div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Detectadas</span>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {result.zombie_subscriptions.map((zombie, idx) => {
                          if (syncedZombies.includes(idx)) return null;
                          return (
                            <motion.div 
                              key={`zombie-${idx}`}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="relative group bg-[#0a0c10]/60 backdrop-blur-md border border-white/5 rounded-2xl p-4 transition-all duration-300 hover:border-emerald-500/20"
                            >
                              <div className="flex justify-between items-start gap-4 mb-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-base font-black text-white tracking-tight group-hover:text-emerald-400 transition-colors">
                                      {zombie.merchant_name || zombie.description}
                                    </p>
                                    <div className="px-2 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-[8px] font-bold text-emerald-400 uppercase tracking-widest">
                                      {Math.round(zombie.confidence * 100)}% Match
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[250px]">{zombie.description}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-black text-white tracking-tighter">${(zombie.estimated_amount / 100).toFixed(2)}</p>
                                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Mensual</p>
                                </div>
                              </div>
                              
                              <div className="p-3 bg-white/[0.01] rounded-xl border border-white/5 mb-3">
                                <p className="text-slate-400 text-xs leading-relaxed italic">
                                  "{zombie.reasoning}"
                                </p>
                              </div>

                              <button
                                onClick={() => handleAddSubscription(zombie, idx)}
                                className="w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 rounded-xl transition-all duration-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                              >
                                <Zap className="w-3.5 h-3.5" />
                                Añadir a Suscripciones Activas
                              </button>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Categoría: Picos de Consumo */}
                  {result.spending_spikes.length > 0 && result.spending_spikes.some((_, i) => !dismissedSpikes.includes(i)) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-4 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(96,165,250,0.5)]" />
                          <h3 className="text-[9px] font-black text-blue-400/80 uppercase tracking-widest">
                            Irregularidades: Anomalías de Consumo
                          </h3>
                        </div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Auditables</span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {result.spending_spikes.map((spike, idx) => {
                          if (dismissedSpikes.includes(idx)) return null;
                          return (
                            <motion.div 
                              key={`spike-${idx}`}
                              exit={{ opacity: 0, x: 50, scale: 0.95 }}
                              transition={{ duration: 0.3 }}
                              className="bg-[#0a0c10]/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 hover:border-blue-500/20 transition-all duration-300 relative group"
                            >
                              {/* Botón de descartar/justificar en la esquina superior */}
                              <button
                                onClick={() => dismissSpike(idx)}
                                className="absolute top-4 right-4 w-7 h-7 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg flex items-center justify-center border border-white/5 hover:border-white/10 transition-all"
                                title="Marcar como gasto justificado / planeado"
                              >
                                <EyeOff className="w-3.5 h-3.5" />
                              </button>

                              <div className="flex justify-between items-start gap-12 mb-4">
                                <div className="space-y-0.5">
                                  <p className="text-base font-black text-white tracking-tight">{getCategoryName(spike.category_id)}</p>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Alerta de Desviación</span>
                                    <span className="px-1.5 py-0.5 bg-rose-500/10 rounded text-[9px] font-black text-rose-400">+{Math.round(spike.percent_deviation || 0)}%</span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="p-3 bg-white/[0.01] rounded-xl border border-white/5">
                                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Promedio Histórico</p>
                                  <p className="text-base font-black text-slate-400 tracking-tighter">${(spike.normal_average / 100).toFixed(2)}</p>
                                </div>
                                <div className="p-3 bg-blue-500/[0.02] rounded-xl border border-blue-500/10">
                                  <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Gasto Registrado</p>
                                  <p className="text-lg font-black text-white tracking-tighter">${(spike.current_spike / 100).toFixed(2)}</p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3 bg-white/[0.01] p-3 rounded-xl border border-white/5 mb-3">
                                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                                </div>
                                <p className="text-slate-400 text-xs font-medium leading-relaxed italic">
                                  "{spike.reasoning}"
                                </p>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => dismissSpike(idx)}
                                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/5 transition-all text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  Marcar como Justificado
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
