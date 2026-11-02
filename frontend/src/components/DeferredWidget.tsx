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
    void Promise.resolve().then(fetchDeferreds);
  }, []);

  const handleAdvance = async (id: string) => {
    if (!confirm('¿Avanzar una cuota en este diferido?')) return;
    try {
      await deferredAPI.advance(id);
      void fetchDeferreds();
    } catch (error) {
      console.error('Error advancing deferred:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este diferido permanentemente?')) return;
    try {
      await deferredAPI.delete(id);
      void fetchDeferreds();
    } catch (error) {
      console.error('Error deleting deferred:', error);
    }
  };

  const totalRemaining = deferreds.reduce((sum, d) => sum + d.remaining_balance, 0);

  if (loading) return <div className="p-4 text-muted">Cargando diferidos...</div>;
  if (deferreds.length === 0) return null;

  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-accent-strong" />
          <h3 className="text-lg font-semibold text-primary">Consumos Diferidos</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted uppercase tracking-wider">Deuda Total Proyectada</p>
          <p className="text-lg font-bold text-accent-strong">${(totalRemaining / 100).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {deferreds.map(d => {
          const progress = (d.current_installment / d.total_installments) * 100;
          return (
            <div key={d.id} className="bg-surface border border-line rounded-xl p-3 relative group">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-sm font-bold text-primary truncate max-w-[150px]">{d.name}</h4>
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar className="w-3 h-3 text-muted" />
                    <span className="text-xs text-muted">Cuota {d.current_installment} de {d.total_installments}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-accent-strong">${(d.installment_amount / 100).toFixed(2)}/mes</p>
                  <p className="text-xs text-muted">Saldo: ${(d.remaining_balance / 100).toLocaleString()}</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-canvas h-1.5 rounded-full mt-3 mb-2 overflow-hidden">
                <div
                  className="h-full bg-surface-soft   transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {d.is_shared && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-line">
                  <User className="w-3 h-3 text-success" />
                  <span className="text-xs text-success font-medium">
                    {d.shared_with} paga ${(d.shared_amount ? d.shared_amount / 100 : 0).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Actions Overlay */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleAdvance(d.id)}
                  className="p-1.5 bg-surface hover:bg-accent-soft text-accent-strong rounded-lg border border-line"
                  title="Avanzar cuota"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="p-1.5 bg-surface hover:bg-danger-soft text-danger rounded-lg border border-line"
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
