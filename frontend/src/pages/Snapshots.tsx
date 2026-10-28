import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { snapshotsAPI } from '../services/api';
import type { NetWorthSnapshot } from '../types';
import type { AxiosError } from 'axios';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  AlertCircle,
  ShieldCheck,
  History,
  Zap,
  Loader2,
  FileText,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { formatMoney } from '../utils/money';
import Toast from '../components/Toast';

const Snapshots = () => {
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<{ text: string; snapshotId: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning', duration?: number } | null>(null);

  const fetchSnapshots = async () => {
    try {
      const res = await snapshotsAPI.getAll();
      setSnapshots(res.data);
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      setToast({ message: 'Error al sincronizar historial', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchSnapshots);
  }, []);

  const handleAnalyze = async (snapshotId: string) => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await snapshotsAPI.analyze(snapshotId);
      setAnalysis({ text: res.data.analysis || 'La IA no devolvió un análisis para este snapshot.', snapshotId });
    } catch (error) {
      console.error('Error analyzing snapshot:', error);
      const axiosError = error as AxiosError<{ detail?: string }>;
      const msg = axiosError.response?.status === 400
        ? axiosError.response.data?.detail || 'Error en el análisis'
        : 'Error al conectar con la IA';
      setToast({ message: msg, type: 'warning', duration: 8000 });
    } finally {
      setAnalyzing(false);
    }
  };

  const getMonthName = (month: number) => {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[month - 1];
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-primary">
        <Loader2 className="w-10 h-10 animate-spin text-info mb-4" />
        <p className="text-muted font-medium animate-pulse">Recuperando registros históricos...</p>
      </div>
    );
  }

  // Calculate historical growth
  const latestNetWorth = snapshots.length > 0 ? snapshots[0].net_worth : 0;
  const firstNetWorth = snapshots.length > 0 ? snapshots[snapshots.length - 1].net_worth : 0;
  const historicalGrowth = latestNetWorth - firstNetWorth;

  return (
    <div className="snapshots-page compact-page w-full relative min-h-screen pb-20">
      {/* Background Atmosphere */}


      <div className="compact-page-content relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="compact-page-header flex flex-col lg:flex-row lg:items-end justify-between mb-12 gap-6">
          <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>

            <h1 className="text-4xl lg:text-5xl font-black text-primary tracking-tight">Cierres mensuales</h1>
            <p className="text-muted text-sm lg:text-base font-medium mt-2 max-w-md">
              Visualiza la evolución de tu patrimonio neto a través de cierres contables mensuales precisos.
            </p>
            <Link to="/" className="app-btn">Ir al resumen para cerrar un mes</Link>
          </motion.div>

          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-6"
          >
            <div className="text-right">
              <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Crecimiento Histórico</p>
              <p className={`text-2xl font-black tracking-tight ${historicalGrowth >= 0 ? 'text-success' : 'text-danger'}`}>
                {historicalGrowth >= 0 ? '+' : ''}${formatMoney(Math.abs(historicalGrowth))}
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-info-soft flex items-center justify-center border border-line text-info">
              <BarChart3 className="w-7 h-7" />
            </div>
          </motion.div>
        </div>

        {snapshots.length === 0 ? (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="compact-empty bg-surface  border border-line rounded-2xl p-20 text-center"
          >
            <div className="w-24 h-24 rounded-2xl bg-canvas border border-line flex items-center justify-center mx-auto mb-8">
              <History className="w-12 h-12 text-muted" />
            </div>
            <h3 className="text-2xl font-black text-primary mb-3">No hay cierres disponibles</h3>
            <p className="text-muted max-w-sm mx-auto leading-relaxed font-medium mb-8">
              Realiza tu primer "Cierre de Mes" en el resumen para capturar tu estado patrimonial actual.
            </p>
          </motion.div>
        ) : (
          <div className="snapshots-list space-y-10">
            <AnimatePresence mode="popLayout">
              {snapshots.map((snapshot, index) => {
                const prevSnapshot = snapshots[index + 1];
                const netWorthChange = prevSnapshot ? snapshot.net_worth - prevSnapshot.net_worth : 0;
                const netWorthPercent = prevSnapshot ? (netWorthChange / prevSnapshot.net_worth * 100) : 0;
                const isPositive = netWorthChange >= 0;

                return (
                  <motion.div
                    key={snapshot.id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="group relative"
                  >
                    {/* Timeline Line Decor */}
                    {index !== snapshots.length - 1 && (
                      <div className="absolute left-10 top-full h-10 w-[1px] bg-surface-soft  "></div>
                    )}

                    <div className="compact-card bg-surface  border border-line rounded-2xl p-8 lg:p-10 transition-all hover:border-line relative overflow-hidden">
                      {/* Subdued Glow Background */}
                      <div className={`absolute top-0 right-0 w-[40%] h-full  opacity-10 transition-all group-hover:opacity-15 ${isPositive ? 'bg-success' : 'bg-danger'}`}></div>

                      <div className="snapshot-layout relative z-10 flex flex-col lg:flex-row gap-10">
                        {/* Left: Date & Main Info */}
                        <div className="lg:w-1/4">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 rounded-2xl bg-surface-soft   flex items-center justify-center text-primary shadow-lg ">
                              <Calendar className="w-8 h-8" />
                            </div>
                            <div>
                              <h3 className="text-2xl font-black text-primary tracking-tight">
                                {getMonthName(snapshot.month)}
                              </h3>
                              <p className="text-sm font-bold text-info uppercase tracking-widest">
                                {snapshot.year}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-muted text-xs font-bold">
                              <FileText className="w-3 h-3" />
                              <span>REGISTRADO EL:</span>
                            </div>
                            <p className="text-muted text-sm font-medium">
                              {new Date(snapshot.snapshot_date).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </p>
                          </div>

                          <button
                            onClick={() => handleAnalyze(snapshot.id)}
                            disabled={analyzing}
                            className="w-full mt-8 flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-surface-soft border border-line text-on-color text-xs font-black uppercase tracking-widest hover:bg-info transition-all group/btn"
                          >
                            {analyzing && analysis?.snapshotId === snapshot.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 text-info group-hover/btn:text-primary transition-colors" />
                                <span>Analizar Auditoría</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Center: Financial Stats */}
                        <div className="snapshot-stats flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="compact-card-mini bg-surface-soft rounded-2xl p-6 border border-line">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-8 h-8 rounded-xl bg-success-soft flex items-center justify-center border border-line text-success">
                                <DollarSign className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-black text-muted uppercase tracking-widest">Activos Totales</span>
                            </div>
                            <p className="text-3xl font-black text-primary tracking-tight">${formatMoney(snapshot.total_assets)}</p>
                            <p className="text-xs text-success font-bold mt-1 uppercase tracking-widest">Capital Bruto</p>
                          </div>

                          <div className="compact-card-mini bg-surface-soft rounded-2xl p-6 border border-line">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-8 h-8 rounded-xl bg-danger-soft flex items-center justify-center border border-line text-danger">
                                <AlertCircle className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-black text-muted uppercase tracking-widest">Pasivos Totales</span>
                            </div>
                            <p className="text-3xl font-black text-primary tracking-tight">${formatMoney(snapshot.total_liabilities)}</p>
                            <p className="text-xs text-danger font-bold mt-1 uppercase tracking-widest">Deuda Externa</p>
                          </div>

                          <div className={`compact-card-mini rounded-2xl p-6 border transition-all ${isPositive ? 'bg-info-soft border-line ' : 'bg-danger-soft border-line'}`}>
                            <div className="flex items-center gap-2 mb-4">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${isPositive ? 'bg-info-soft border-line text-info' : 'bg-danger-soft border-line text-danger'}`}>
                                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              </div>
                              <span className={`text-xs font-black uppercase tracking-widest ${isPositive ? 'text-info' : 'text-danger'}`}>Patrimonio Neto</span>
                            </div>
                            <p className="text-3xl font-black text-primary tracking-tight">${formatMoney(snapshot.net_worth)}</p>

                            {prevSnapshot && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black ${isPositive ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
                                  {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                  {isPositive ? '+' : ''}{netWorthPercent.toFixed(1)}%
                                </div>
                                <span className="text-xs font-bold text-muted uppercase tracking-widest">VS MES ANTERIOR</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* AI Analysis Dropdown */}
                      <AnimatePresence>
                        {analysis && analysis.snapshotId === snapshot.id && (
                          <motion.div
                            initial={false}
                            animate={{ opacity: 1, height: 'auto', marginTop: 32 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            className="relative overflow-hidden"
                          >
                            <div className="compact-panel bg-surface-soft    rounded-2xl border border-line p-8">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-info-soft flex items-center justify-center text-info">
                                  <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-black text-primary uppercase tracking-wide">Análisis del cierre</h4>
                                  <p className="text-xs font-bold text-info uppercase tracking-widest">Análisis con IA</p>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <p className="text-sm text-primary leading-relaxed font-medium">
                                  {analysis.text}
                                </p>
                                <div className="pt-4 border-t border-line flex items-center gap-4">
                                  <div className="flex items-center gap-2 text-xs font-black text-success uppercase tracking-widest">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>Análisis orientativo</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs font-black text-info uppercase tracking-widest">
                                    <Zap className="w-3 h-3" />
                                    <span>Plan de acción listo</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Snapshots;
