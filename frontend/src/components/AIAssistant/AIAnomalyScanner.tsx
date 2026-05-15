import React, { useState } from 'react';
import { CheckCircle, X, RefreshCw, ShieldAlert, Zap, Target, Search } from 'lucide-react';
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

  const handleScan = async () => {
    setIsScanning(true);
    setResult(null);
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

  const handleAddSubscription = async (zombie: ZombieSubscription) => {
    try {
      await subscriptionsAPI.create({
        name: zombie.description,
        amount: zombie.estimated_amount,
        frequency: 'monthly',
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      console.error('Error adding subscription:', error);
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || categoryId;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl relative"
    >
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
      
      <div className="relative flex items-center justify-between py-5 px-8 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight leading-none">Escáner de <span className="text-amber-500">Anomalías</span></h2>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">Motor de Auditoría v3.0</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-8">
        {!result && !isScanning && (
          <div className="flex flex-col items-center text-center space-y-8 py-6">
            <div className="w-24 h-24 rounded-full bg-amber-500/5 border border-amber-500/20 flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border border-amber-500/20 animate-ping"></div>
              <Search className="w-10 h-10 text-amber-500/60" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white tracking-tight">Iniciar Auditoría IA</h3>
              <p className="text-slate-400 text-sm font-medium max-w-sm mx-auto">
                Nuestro motor analizará tus patrones de gasto para detectar suscripciones fantasmas y gastos inusuales.
              </p>
            </div>
            <button
              onClick={handleScan}
              className="group relative w-full max-w-xs"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-600 to-yellow-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
              <div className="relative bg-gradient-to-r from-amber-600 to-yellow-600 text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]">
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700" />
                Comenzar Escaneo
              </div>
            </button>
          </div>
        )}

        {isScanning && (
          <div className="flex flex-col items-center justify-center py-16 space-y-8">
            <div className="relative w-32 h-32">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-t-2 border-r-2 border-amber-500/40"
              ></motion.div>
              <div className="absolute inset-4 rounded-full border border-amber-500/10 animate-pulse bg-amber-500/5 flex items-center justify-center">
                <Target className="w-8 h-8 text-amber-500 animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-white font-black text-lg tracking-tight uppercase">Analizando Anomalías</p>
              <p className="text-slate-500 text-xs font-bold animate-pulse tracking-widest">PROCESANDO HISTORIAL FINANCIERO...</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {result && !isScanning && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-center bg-slate-800/40 border border-white/5 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Resultado de Auditoría</span>
                </div>
                <button
                  onClick={handleScan}
                  className="text-[10px] font-black text-amber-500 hover:text-amber-400 uppercase tracking-widest flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-Escanear
                </button>
              </div>

              {!result.zombie_subscriptions.length && !result.spending_spikes.length ? (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-[2rem] p-12 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-white tracking-tight">Finanzas en Orden</h4>
                    <p className="text-slate-400 text-sm mt-2">No se detectaron irregularidades en tu historial reciente.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {result.zombie_subscriptions.length > 0 && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-6 bg-emerald-400 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
                          <h3 className="text-[10px] font-black text-emerald-400/80 uppercase tracking-[0.4em]">
                            Soberanía: Suscripciones
                          </h3>
                        </div>
                        <div className="h-px flex-1 mx-6 bg-gradient-to-r from-emerald-500/20 to-transparent" />
                      </div>
                      
                      <div className="grid grid-cols-1 gap-6">
                        {result.zombie_subscriptions.map((zombie, idx) => (
                          <motion.div 
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="relative group"
                          >
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-transparent rounded-[2.5rem] blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                            <div className="relative bg-[#0a0c10]/80 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-8 transition-all duration-500 group-hover:border-emerald-500/30">
                              <div className="flex justify-between items-start mb-6">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-3">
                                    <p className="text-2xl font-black text-white tracking-tighter group-hover:text-emerald-400 transition-colors">
                                      {zombie.merchant_name || zombie.description}
                                    </p>
                                    <div className="px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Match {Math.round(zombie.confidence * 100)}%</span>
                                    </div>
                                  </div>
                                  {zombie.merchant_name && (
                                    <p className="text-xs text-slate-500 font-medium tracking-wide flex items-center gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                                      {zombie.description}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="text-3xl font-black text-white tracking-tighter leading-none">${(zombie.estimated_amount / 100).toFixed(2)}</p>
                                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Estimado Mensual</p>
                                </div>
                              </div>
                              
                              <div className="p-5 bg-white/[0.02] rounded-3xl border border-white/5 mb-8 group-hover:bg-emerald-500/[0.03] transition-colors">
                                <p className="text-slate-400 text-[13px] font-medium leading-relaxed italic opacity-80">
                                  "{zombie.reasoning}"
                                </p>
                              </div>

                              <button
                                onClick={() => handleAddSubscription(zombie)}
                                className="w-full py-5 bg-gradient-to-r from-emerald-500/10 to-transparent hover:from-emerald-500 hover:to-emerald-400 text-slate-300 hover:text-white border border-emerald-500/20 rounded-[1.8rem] transition-all duration-500 text-[11px] font-black uppercase tracking-[0.3em] group/btn"
                              >
                                <span className="flex items-center justify-center gap-3">
                                  Sincronizar con el Sistema
                                  <Zap className="w-4 h-4 group-hover/btn:animate-pulse" />
                                </span>
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.spending_spikes.length > 0 && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-6 bg-blue-400 rounded-full shadow-[0_0_15px_rgba(96,165,250,0.5)]" />
                          <h3 className="text-[10px] font-black text-blue-400/80 uppercase tracking-[0.4em]">
                            Auditoría: Consumos
                          </h3>
                        </div>
                        <div className="h-px flex-1 mx-6 bg-gradient-to-r from-blue-500/20 to-transparent" />
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        {result.spending_spikes.map((spike, idx) => (
                          <div key={idx} className="relative bg-[#0a0c10]/60 backdrop-blur-md border border-white/5 rounded-[2.5rem] p-8 hover:border-blue-500/20 transition-all duration-500">
                            <div className="flex justify-between items-center mb-8">
                              <div className="space-y-1">
                                <p className="text-2xl font-black text-white tracking-tighter">{getCategoryName(spike.category_id)}</p>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Desviación en el periodo</p>
                              </div>
                              <div className="px-5 py-2 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                                <span className="text-xs font-black text-rose-400">+{Math.round(spike.percent_deviation || 0)}%</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-8">
                              <div className="p-6 bg-white/[0.02] rounded-[1.8rem] border border-white/5">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Promedio Base</p>
                                <p className="text-2xl font-black text-slate-400 tracking-tighter">${(spike.normal_average / 100).toFixed(2)}</p>
                              </div>
                              <div className="p-6 bg-blue-500/[0.03] rounded-[1.8rem] border border-blue-500/10 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -mr-16 -mt-16" />
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Pico Actual</p>
                                <p className="text-3xl font-black text-white tracking-tighter">${(spike.current_spike / 100).toFixed(2)}</p>
                              </div>
                            </div>

                            <div className="flex items-start gap-4 bg-white/[0.02] p-5 rounded-3xl border border-white/5">
                              <div className="w-10 h-10 rounded-2xl bg-slate-500/10 flex items-center justify-center shrink-0">
                                <ShieldAlert className="w-5 h-5 text-slate-500" />
                              </div>
                              <p className="text-slate-400 text-sm font-medium leading-relaxed italic pt-1">
                                "{spike.reasoning}"
                              </p>
                            </div>
                          </div>
                        ))}
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
