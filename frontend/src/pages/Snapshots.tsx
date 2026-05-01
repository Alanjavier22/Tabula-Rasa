import { useState, useEffect } from 'react';
import { snapshotsAPI } from '../services/api';
import type { NetWorthSnapshot } from '../types';
import { Sparkles, TrendingUp, TrendingDown, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import Toast from '../components/Toast';

const Snapshots = () => {
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<{ text: string; snapshotId: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const fetchSnapshots = async () => {
    try {
      const res = await snapshotsAPI.getAll();
      setSnapshots(res.data);
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      setToast({ message: 'Error al cargar snapshots', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (snapshotId: string) => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await snapshotsAPI.analyze(snapshotId);
      setAnalysis({ text: res.data.analysis, snapshotId });
    } catch (error: any) {
      console.error('Error analyzing snapshot:', error);
      if (error.response?.status === 400) {
        setToast({ message: error.response.data.detail || 'Error al analizar mes', type: 'warning' });
      } else {
        setToast({ message: 'Error al analizar mes', type: 'error' });
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const getMonthName = (month: number) => {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return months[month - 1];
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-white">Cargando snapshots...</div>;
  }

  return (
    <div className="w-full">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Snapshots de Patrimonio</h1>
        <p className="text-slate-300 text-sm lg:text-base">Historial de cierres mensuales contables</p>
      </div>

      {snapshots.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
          <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400 mb-2">No hay snapshots disponibles</p>
          <p className="text-sm text-slate-500">Usa el botón "Cerrar Mes Contable" en el Dashboard para crear el primer snapshot</p>
        </div>
      ) : (
        <div className="space-y-4">
          {snapshots.map((snapshot, index) => {
            const prevSnapshot = snapshots[index + 1];
            const netWorthChange = prevSnapshot ? snapshot.net_worth - prevSnapshot.net_worth : 0;
            const netWorthPercent = prevSnapshot ? (netWorthChange / prevSnapshot.net_worth * 100) : 0;

            return (
              <div key={snapshot.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {getMonthName(snapshot.month)} {snapshot.year}
                      </h3>
                      <p className="text-sm text-slate-400">
                        {new Date(snapshot.snapshot_date).toLocaleDateString('es-ES', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAnalyze(snapshot.id)}
                    disabled={analyzing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    {analyzing && analysis?.snapshotId === snapshot.id ? 'Analizando...' : 'Analizar Mes'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-400">Activos Totales</span>
                    </div>
                    <p className="text-2xl font-bold text-green-300">${snapshot.total_assets.toFixed(2)}</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-xs text-red-400">Pasivos Totales</span>
                    </div>
                    <p className="text-2xl font-bold text-red-300">${snapshot.total_liabilities.toFixed(2)}</p>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      {netWorthChange >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-blue-400" />
                      )}
                      <span className="text-xs text-blue-400">Patrimonio Neto</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-300">${snapshot.net_worth.toFixed(2)}</p>
                    {prevSnapshot && (
                      <p className={`text-xs mt-1 ${netWorthChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {netWorthChange >= 0 ? '+' : ''}{netWorthChange.toFixed(2)} ({netWorthPercent.toFixed(1)}%)
                      </p>
                    )}
                  </div>
                </div>

                {analysis && analysis.snapshotId === snapshot.id && (
                  <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 backdrop-blur-xl rounded-xl border border-purple-500/50 p-4 mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-5 h-5 text-purple-400" />
                      <h4 className="text-sm font-semibold text-white">Análisis CFO</h4>
                    </div>
                    <p className="text-sm text-slate-200">{analysis.text}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Snapshots;
