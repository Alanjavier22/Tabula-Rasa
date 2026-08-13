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
    fetchSnapshots();
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
      <div className="flex flex-col items-center justify-center h-[60vh] text-white">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Recuperando registros históricos...</p>
      </div>
    );
  }

  // Calculate historical growth
  const latestNetWorth = snapshots.length > 0 ? snapshots[0].net_worth : 0;
  const firstNetWorth = snapshots.length > 0 ? snapshots[snapshots.length - 1].net_worth : 0;
  const historicalGrowth = latestNetWorth - firstNetWorth;

  return (
    <div className="w-full relative min-h-screen pb-20">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[10%] left-[20%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[20%] right-[10%] w-[40%] h-[40%] bg-emerald-600/5 rounded-full blur-[150px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-12 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-1">
              <div className="w-8 h-[1px] bg-blue-500/50"></div>
              <span>Archivo de Auditoría</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
              Tus <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Snapshots</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium mt-2 max-w-md">
              Visualiza la evolución de tu patrimonio neto a través de cierres contables mensuales precisos.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-6"
          >
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Crecimiento Histórico</p>
              <p className={`text-2xl font-black tracking-tight ${historicalGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {historicalGrowth >= 0 ? '+' : ''}${formatMoney(Math.abs(historicalGrowth))}
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
              <BarChart3 className="w-7 h-7" />
            </div>
          </motion.div>
        </div>

        {snapshots.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/40 backdrop-blur-3xl border border-white/5 rounded-[3rem] p-20 text-center"
          >
            <div className="w-24 h-24 rounded-[2rem] bg-slate-900 border border-white/5 flex items-center justify-center mx-auto mb-8">
              <History className="w-12 h-12 text-slate-600" />
            </div>
            <h3 className="text-2xl font-black text-white mb-3">No hay cierres disponibles</h3>
            <p className="text-slate-500 max-w-sm mx-auto leading-relaxed font-medium mb-8">
              Realiza tu primer "Cierre de Mes" en el dashboard para capturar tu estado patrimonial actual.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-10">
            <AnimatePresence mode="popLayout">
              {snapshots.map((snapshot, index) => {
                const prevSnapshot = snapshots[index + 1];
                const netWorthChange = prevSnapshot ? snapshot.net_worth - prevSnapshot.net_worth : 0;
                const netWorthPercent = prevSnapshot ? (netWorthChange / prevSnapshot.net_worth * 100) : 0;
                const isPositive = netWorthChange >= 0;

                return (
                  <motion.div
                    key={snapshot.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="group relative"
                  >
                    {/* Timeline Line Decor */}
                    {index !== snapshots.length - 1 && (
                      <div className="absolute left-10 top-full h-10 w-[1px] bg-gradient-to-b from-blue-500/30 to-transparent"></div>
                    )}

                    <div className="bg-slate-800/30 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 lg:p-10 transition-all hover:border-white/10 relative overflow-hidden">
                      {/* Subdued Glow Background */}
                      <div className={`absolute top-0 right-0 w-[40%] h-full blur-[100px] opacity-10 transition-all group-hover:opacity-15 ${isPositive ? 'bg-emerald-600' : 'bg-rose-600'}`}></div>

                      <div className="relative z-10 flex flex-col lg:flex-row gap-10">
                        {/* Left: Date & Main Info */}
                        <div className="lg:w-1/4">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
                              <Calendar className="w-8 h-8" />
                            </div>
                            <div>
                              <h3 className="text-2xl font-black text-white tracking-tight">
                                {getMonthName(snapshot.month)}
                              </h3>
                              <p className="text-sm font-bold text-blue-400/80 uppercase tracking-widest">
                                {snapshot.year}
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                              <FileText className="w-3 h-3" />
                              <span>REGISTRADO EL:</span>
                            </div>
                            <p className="text-slate-300 text-sm font-medium">
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
                            className="w-full mt-8 flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all group/btn"
                          >
                            {analyzing && analysis?.snapshotId === snapshot.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 text-blue-400 group-hover/btn:text-white transition-colors" />
                                <span>Analizar Auditoría</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Center: Financial Stats */}
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="bg-black/20 rounded-[2rem] p-6 border border-white/5">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                                <DollarSign className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Activos Totales</span>
                            </div>
                            <p className="text-3xl font-black text-white tracking-tight">${formatMoney(snapshot.total_assets)}</p>
                            <p className="text-[10px] text-emerald-400/60 font-bold mt-1 uppercase tracking-widest">Capital Bruto</p>
                          </div>

                          <div className="bg-black/20 rounded-[2rem] p-6 border border-white/5">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-400">
                                <AlertCircle className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pasivos Totales</span>
                            </div>
                            <p className="text-3xl font-black text-white tracking-tight">${formatMoney(snapshot.total_liabilities)}</p>
                            <p className="text-[10px] text-rose-400/60 font-bold mt-1 uppercase tracking-widest">Deuda Externa</p>
                          </div>

                          <div className={`rounded-[2rem] p-6 border transition-all ${isPositive ? 'bg-blue-500/10 border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'bg-rose-500/10 border-rose-500/20'}`}>
                            <div className="flex items-center gap-2 mb-4">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${isPositive ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-rose-500/20 border-rose-500/30 text-rose-400'}`}>
                                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              </div>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${isPositive ? 'text-blue-400' : 'text-rose-400'}`}>Patrimonio Neto</span>
                            </div>
                            <p className="text-3xl font-black text-white tracking-tight">${formatMoney(snapshot.net_worth)}</p>
                            
                            {prevSnapshot && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                  {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                  {isPositive ? '+' : ''}{netWorthPercent.toFixed(1)}%
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">VS MES ANTERIOR</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* AI Analysis Dropdown */}
                      <AnimatePresence>
                        {analysis && analysis.snapshotId === snapshot.id && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginTop: 32 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            className="relative overflow-hidden"
                          >
                            <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 backdrop-blur-3xl rounded-[2rem] border border-blue-500/30 p-8">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                                  <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-black text-white uppercase tracking-[0.2em]">Neural Intelligence Report</h4>
                                  <p className="text-[10px] font-bold text-blue-400/60 uppercase tracking-widest">Análisis CFO Generativo</p>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <p className="text-sm text-slate-200 leading-relaxed font-medium">
                                  {analysis.text}
                                </p>
                                <div className="pt-4 border-t border-white/10 flex items-center gap-4">
                                  <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>Auditoría Verificada</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] font-black text-blue-400 uppercase tracking-widest">
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
