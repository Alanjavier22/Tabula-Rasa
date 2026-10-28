import React, { useState, useEffect } from 'react';
import { CheckCircle, X, RefreshCw, ShieldAlert, Zap, Target, Search, Check, EyeOff, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AIAgentService } from '../../services/AIAgentService';
import type { AnomalyScanResult, ZombieSubscription } from '../../services/AIAgentService';
import { subscriptionsAPI } from '../../services/api';
import type { Cents, Transaction, Subscription, Category, Goal } from '../../types';

interface AIAnomalyScannerProps {
  recentTransactions: Transaction[];
  currentSubscriptions: Subscription[];
  categories: Category[];
  goals: Goal[];
  onClose?: () => void;
}

export const AIAnomalyScanner: React.FC<AIAnomalyScannerProps> = ({
  recentTransactions,
  currentSubscriptions,
  categories,
  goals,
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
        goals
      );
      setResult(scanResult);
    } catch (error) {
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
        amount: zombie.estimated_amount as Cents,
        frequency: 'monthly',
        // eslint-disable-next-line react-hooks/purity -- dentro de un onClick handler, no del render body; el compiler no distingue el contexto
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
  let scoreClasses = 'bg-danger-soft border-line text-danger ';
  if (score > 80) {
    scoreClasses = 'bg-success-soft border-line text-success ';
  } else if (score > 50) {
    scoreClasses = 'bg-warning-soft border-line text-warning ';
  }

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="bg-surface border border-line rounded-2xl overflow-hidden flex flex-col shadow-2xl relative max-h-[95vh]"
    >
      {/* Background Glows */}


      <div className="relative flex items-center justify-between py-3.5 px-6 border-b border-line shrink-0 bg-canvas  sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-warning-soft flex items-center justify-center border border-line">
            <ShieldAlert className="w-4.5 h-4.5 text-warning" />
          </div>
          <div>
            <h2 className="text-base font-black text-primary tracking-tight leading-none">Auditoría <span className="text-warning">Forense IA</span></h2>
            <p className="text-xs text-muted font-black uppercase tracking-wide mt-0.5">Motor de Detección Activa</p>
          </div>
        </div>

        {result && !isScanning && (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${scoreClasses} transition-all duration-500`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-xs font-black uppercase tracking-wider">Score Salud: <strong>{score}%</strong></span>
          </div>
        )}

        {onClose && (
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-5 overflow-y-auto custom-scrollbar">
        {!result && !isScanning && (
          <div className="flex flex-col items-center text-center space-y-6 py-6 max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-warning-soft border border-line flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border border-line animate-ping"></div>
              <Search className="w-8 h-8 text-warning animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-primary tracking-tight">Iniciar Escaneo de Salud</h3>
              <p className="text-muted text-xs font-medium leading-relaxed">
                El auditor financiero digital buscará fugas silenciosas de dinero, picos inusuales y cobros duplicados en base a tu comportamiento histórico de 6 meses.
              </p>
            </div>
            <button
              onClick={handleScan}
              className="group relative w-full"
            >
              <div className="absolute -inset-1 bg-surface-soft   rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
              <div className="relative bg-surface-soft   text-primary py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99]">
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
                className="absolute inset-0 rounded-full border-t-2 border-r-2 border-line"
              ></motion.div>
              <div className="absolute inset-3 rounded-full border border-line animate-pulse bg-warning-soft flex items-center justify-center">
                <Target className="w-6 h-6 text-warning animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-primary font-black text-sm tracking-tight uppercase">Auditando Cuentas y Tarjetas</p>
              <p className="text-muted text-xs font-black animate-pulse tracking-widest uppercase">Buscando picos de gasto y suscripciones fantasmas...</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {result && !isScanning && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <div className="flex justify-between items-center bg-surface border border-line rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>
                  <span className="text-xs font-black text-muted uppercase tracking-widest">Reporte Forense Listo</span>
                </div>
                <button
                  onClick={handleScan}
                  className="text-xs font-black text-warning hover:text-warning uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Escanear de Nuevo
                </button>
              </div>

              {/* Caso de Éxito Absoluto */}
              {(result.zombie_subscriptions.length - syncedZombies.length <= 0) &&
               (result.spending_spikes.length - dismissedSpikes.length <= 0) ? (
                <div className="bg-success-soft border border-line rounded-2xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-success-soft border border-line flex items-center justify-center mx-auto">
                    <CheckCircle className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-primary tracking-tight">Cero Irregularidades Activas</h4>
                    <p className="text-muted text-xs mt-1 leading-relaxed">¡Tus cuentas están perfectamente blindadas y saludables!</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Categoría: Suscripciones Zombie */}
                  {result.zombie_subscriptions.some((_, i) => !syncedZombies.includes(i)) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-4 bg-success rounded-full " />
                          <h3 className="text-xs font-black text-success uppercase tracking-widest">
                            Fugas: Suscripciones Zombie
                          </h3>
                        </div>
                        <span className="text-xs font-black text-muted uppercase tracking-wider">Detectadas</span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {result.zombie_subscriptions.map((zombie, idx) => {
                          if (syncedZombies.includes(idx)) return null;
                          return (
                            <motion.div
                              key={`${zombie.merchant_name ?? zombie.description}-${zombie.estimated_amount}-${zombie.reasoning}`}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="relative group bg-surface  border border-line rounded-2xl p-4 transition-all duration-300 hover:border-line"
                            >
                              <div className="flex justify-between items-start gap-4 mb-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-base font-black text-primary tracking-tight group-hover:text-success transition-colors">
                                      {zombie.merchant_name || zombie.description}
                                    </p>
                                    <div className="px-2 py-0.5 bg-success-soft rounded-full border border-line text-xs font-bold text-success uppercase tracking-widest">
                                      {Math.round(zombie.confidence * 100)}% Match
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted mt-0.5 truncate max-w-[250px]">{zombie.description}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-black text-primary tracking-tight">${(zombie.estimated_amount / 100).toFixed(2)}</p>
                                  <p className="text-xs font-bold text-muted uppercase tracking-widest mt-0.5">Mensual</p>
                                </div>
                              </div>

                              <div className="p-3 bg-surface-soft rounded-xl border border-line mb-3">
                                <p className="text-muted text-xs leading-relaxed italic">
                                  "{zombie.reasoning}"
                                </p>
                              </div>

                              <button
                                onClick={() => handleAddSubscription(zombie, idx)}
                                className="w-full py-2.5 bg-success-soft hover:bg-success text-success hover:text-on-color border border-line rounded-xl transition-all duration-300 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
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
                  {result.spending_spikes.some((_, i) => !dismissedSpikes.includes(i)) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-4 bg-info rounded-full " />
                          <h3 className="text-xs font-black text-info uppercase tracking-widest">
                            Irregularidades: Anomalías de Consumo
                          </h3>
                        </div>
                        <span className="text-xs font-black text-muted uppercase tracking-wider">Auditables</span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {result.spending_spikes.map((spike, idx) => {
                          if (dismissedSpikes.includes(idx)) return null;
                          return (
                            <motion.div
                              key={`${spike.category_id}-${spike.current_spike}-${spike.reasoning}`}
                              exit={{ opacity: 0, x: 50, scale: 0.95 }}
                              transition={{ duration: 0.3 }}
                              className="bg-surface  border border-line rounded-2xl p-4 hover:border-line transition-all duration-300 relative group"
                            >
                              {/* Botón de descartar/justificar en la esquina superior */}
                              <button
                                onClick={() => dismissSpike(idx)}
                                className="absolute top-4 right-4 w-7 h-7 bg-surface hover:bg-surface text-muted hover:text-primary rounded-lg flex items-center justify-center border border-line hover:border-line transition-all"
                                title="Marcar como gasto justificado / planeado"
                              >
                                <EyeOff className="w-3.5 h-3.5" />
                              </button>

                              <div className="flex justify-between items-start gap-12 mb-4">
                                <div className="space-y-0.5">
                                  <p className="text-base font-black text-primary tracking-tight">{getCategoryName(spike.category_id)}</p>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-muted uppercase tracking-widest">Alerta de Desviación</span>
                                    <span className="px-1.5 py-0.5 bg-danger-soft rounded text-xs font-black text-danger">+{Math.round(spike.percent_deviation || 0)}%</span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="p-3 bg-surface-soft rounded-xl border border-line">
                                  <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Promedio Histórico</p>
                                  <p className="text-base font-black text-muted tracking-tight">${(spike.normal_average / 100).toFixed(2)}</p>
                                </div>
                                <div className="p-3 bg-blue-500/[0.02] rounded-xl border border-line">
                                  <p className="text-xs font-black text-info uppercase tracking-widest mb-1">Gasto Registrado</p>
                                  <p className="text-lg font-black text-primary tracking-tight">${(spike.current_spike / 100).toFixed(2)}</p>
                                </div>
                              </div>

                              <div className="flex items-start gap-3 bg-surface-soft p-3 rounded-xl border border-line mb-3">
                                <div className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center shrink-0 mt-0.5">
                                  <ShieldAlert className="w-4 h-4 text-warning" />
                                </div>
                                <p className="text-muted text-xs font-medium leading-relaxed italic">
                                  "{spike.reasoning}"
                                </p>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => dismissSpike(idx)}
                                  className="flex-1 py-2 rounded-xl bg-surface hover:bg-surface text-muted hover:text-primary border border-line transition-all text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                                >
                                  <Check className="w-3.5 h-3.5 text-success" />
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
