import { useState, useEffect } from 'react';
import { iousAPI, accountsAPI } from '../services/api';
import type { IOU, Account } from '../types';
import { DollarSign, CheckCircle, User, Clock, X } from 'lucide-react';

const IOUWidget = () => {
  const [ious, setIous] = useState<IOU[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [settleModal, setSettleModal] = useState<{ isOpen: boolean; iouId: string | null }>({ isOpen: false, iouId: null });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [settling, SetSettling] = useState(false);

  useEffect(() => {
    fetchPendingIous();
    fetchAccounts();
  }, []);

  const fetchPendingIous = async () => {
    try {
      const res = await iousAPI.getPending();
      setIous(res.data);
    } catch (error) {
      console.error('Error fetching IOUs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await accountsAPI.getAll();
      setAccounts(res.data.filter((acc: Account) => acc.is_active));
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const handleSettleClick = (iouId: string) => {
    setSettleModal({ isOpen: true, iouId });
    setSelectedAccountId(null);
  };

  const handleSettle = async () => {
    if (!settleModal.iouId || !selectedAccountId) return;
    
    SetSettling(true);
    try {
      await iousAPI.settle(settleModal.iouId, { account_id: selectedAccountId });
      setIous(ious.filter(iou => iou.id !== settleModal.iouId));
      setSettleModal({ isOpen: false, iouId: null });
      setSelectedAccountId(null);
    } catch (error) {
      console.error('Error settling IOU:', error);
    } finally {
      SetSettling(false);
    }
  };

  const theyOweTotal = ious.filter(iou => iou.iou_type === 'they_owe').reduce((sum, iou) => sum + iou.amount, 0);
  const iOweTotal = ious.filter(iou => iou.iou_type === 'i_owe').reduce((sum, iou) => sum + iou.amount, 0);

  if (loading) {
    return <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">Cargando...</div>;
  }

  if (ious.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-white">Dinero Flotante</h3>
        </div>
        <span className="text-xs text-slate-400">{ious.length} pendiente(s)</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
          <p className="text-xs text-green-400 mb-1">Me deben</p>
          <p className="text-lg font-bold text-green-300">${(theyOweTotal / 100).toFixed(2)}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-center">
          <p className="text-xs text-red-400 mb-1">Debo</p>
          <p className="text-lg font-bold text-red-300">${(iOweTotal / 100).toFixed(2)}</p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {ious.map(iou => (
          <div key={iou.id} className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg">
            <div className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                iou.iou_type === 'they_owe' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{iou.person_name}</p>
                {iou.description && (
                  <p className="text-xs text-slate-400 truncate">{iou.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className={`text-sm font-semibold ${
                  iou.iou_type === 'they_owe' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {iou.iou_type === 'they_owe' ? '+' : '-'}${(iou.amount / 100).toFixed(2)}
                </p>
                {iou.due_date && (
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {new Date(iou.due_date).toLocaleDateString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleSettleClick(iou.id)}
                className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-green-500/20 rounded transition-colors"
                title="Marcar como saldado"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Account Selection Modal */}
      {settleModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSettleModal({ isOpen: false, iouId: null })} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <button
              onClick={() => setSettleModal({ isOpen: false, iouId: null })}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-white mb-2">Saldar IOU</h3>
            <p className="text-sm text-slate-400 mb-4">¿En qué cuenta recibiste el dinero?</p>
            
            <div className="space-y-2 mb-4">
              {accounts.map(account => (
                <button
                  key={account.id}
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedAccountId === account.id
                      ? 'bg-purple-600/20 border border-purple-500 text-white'
                      : 'bg-slate-700/50 border border-slate-600 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{account.name}</span>
                    <span className="text-sm">${account.balance.toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
            
            <button
              onClick={handleSettle}
              disabled={!selectedAccountId || settling}
              className="w-full py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {settling ? 'Saldando...' : 'Confirmar Saldado'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IOUWidget;
