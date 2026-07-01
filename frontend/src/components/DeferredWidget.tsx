import { useState, useEffect } from 'react';
import { deferredAPI } from '../services/api';
import type { DeferredPayment } from '../types';
import { CreditCard, Calendar, ArrowRight, User, Trash2 } from 'lucide-react';

const DeferredWidget = () => {
  const [deferreds, setDeferreds] = useState<DeferredPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeferreds = async () => {
    try {
      const res = await deferredAPI.getAll();
      setDeferreds(res.data);
    } catch (error) {
      console.error('Error fetching deferred payments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeferreds();
  }, []);

  const handleAdvance = async (id: string) => {
    if (!confirm('¿Avanzar una cuota en este diferido?')) return;
    try {
      await deferredAPI.advance(id);
      fetchDeferreds();
    } catch (error) {
      console.error('Error advancing deferred:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este diferido permanentemente?')) return;
    try {
      await deferredAPI.delete(id);
      fetchDeferreds();
    } catch (error) {
      console.error('Error deleting deferred:', error);
    }
  };

  const totalRemaining = deferreds.reduce((sum, d) => sum + d.remaining_balance, 0);

  if (loading) return <div className="p-4 text-slate-400">Cargando diferidos...</div>;
  if (deferreds.length === 0) return null;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-semibold text-white">Consumos Diferidos</h3>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Deuda Total Proyectada</p>
          <p className="text-lg font-bold text-indigo-300">${(totalRemaining / 100).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {deferreds.map(d => {
          const progress = (d.current_installment / d.total_installments) * 100;
          return (
            <div key={d.id} className="bg-slate-700/30 border border-white/5 rounded-xl p-3 relative group">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-sm font-bold text-white truncate max-w-[150px]">{d.name}</h4>
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span className="text-[10px] text-slate-400">Cuota {d.current_installment} de {d.total_installments}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-indigo-400">${(d.installment_amount / 100).toFixed(2)}/mes</p>
                  <p className="text-[9px] text-slate-500">Saldo: ${(d.remaining_balance / 100).toLocaleString()}</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-900/50 h-1.5 rounded-full mt-3 mb-2 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {d.is_shared && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/5">
                  <User className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-medium">
                    {d.shared_with} paga ${(d.shared_amount ? d.shared_amount / 100 : 0).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Actions Overlay */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => handleAdvance(d.id)}
                  className="p-1.5 bg-slate-800 hover:bg-indigo-500/20 text-indigo-400 rounded-lg border border-slate-700"
                  title="Avanzar cuota"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => handleDelete(d.id)}
                  className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-red-400 rounded-lg border border-slate-700"
                  title="Eliminar"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DeferredWidget;
