import type { Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, PiggyBank, DollarSign, Building2, Link, CheckCircle2, RefreshCw, X } from 'lucide-react';
import type { Account } from '../../types';
import Select from '../common/Select';
import { type AccountFormData, getAccountStyle, getAccountIcon } from './shared';

interface EditAccountModalProps {
  isOpen: boolean;
  editForm: AccountFormData;
  setEditForm: Dispatch<SetStateAction<AccountFormData>>;
  editingAccount: Account | null;
  accounts: Account[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const EditAccountModal = ({ isOpen, editForm, setEditForm, editingAccount, accounts, saving, onClose, onSubmit }: EditAccountModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && editingAccount && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            {/* Header */}
            <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-white/5 shrink-0">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <Edit className="w-5 h-5 text-blue-400" />
                </div>
                Editar Cuenta
              </h2>
              <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">

              {/* VISTA PREVIA DE TARJETA VIRTUAL */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                  Vista Previa de Cuenta
                </label>
                <div className="bg-black/20 rounded-3xl p-4 border border-white/5">
                  <div className={`aspect-[1.6/1] w-full rounded-2xl bg-gradient-to-br ${getAccountStyle(editForm.account_type)} p-6 border border-white/10 relative overflow-hidden flex flex-col justify-between shadow-2xl`}>
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center border border-white/10">
                        {getAccountIcon(editForm.account_type)}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Banco</span>
                        <span className="text-xs font-bold text-white/80">{editForm.bank_name || 'Nombre del Banco'}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/30 block mb-1">Saldo Actual</span>
                      <span className="text-3xl font-black text-white tracking-tighter">${editForm.balance || '0.00'}</span>
                    </div>

                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-white/60 tracking-tight">{editForm.name || 'Titular de la Cuenta'}</span>
                      <div className="px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                        <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter">
                          {editForm.account_type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Nombre y Tipo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <Building2 className="w-3 h-3" />
                      Alias de la Cuenta
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={e => setEditForm({...editForm, name: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <PiggyBank className="w-3 h-3" />
                      Tipo de Recurso
                    </label>
                    <Select
                      value={editForm.account_type}
                      onChange={(value) => setEditForm({...editForm, account_type: value})}
                      options={[
                        { value: 'checking', label: 'Cuenta Corriente' },
                        { value: 'savings', label: 'Ahorros' },
                        { value: 'credit_card', label: 'Tarjeta Crédito' },
                        { value: 'investment', label: 'Inversión' },
                        { value: 'cash', label: 'Efectivo' }
                      ]}
                    />
                  </div>
                </div>

                {/* Saldo y Banco */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <DollarSign className="w-3 h-3" />
                      Saldo Actual
                    </label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        value={editForm.balance}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9.,]/g, '');
                          setEditForm({...editForm, balance: val});
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all font-bold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <Building2 className="w-3 h-3" />
                      Entidad Financiera
                    </label>
                    <input
                      type="text"
                      value={editForm.bank_name}
                      onChange={e => setEditForm({...editForm, bank_name: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Vinculación */}
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                    <Link className="w-3 h-3" />
                    Cuenta Vinculada
                  </label>
                  <Select
                    value={editForm.linked_account_id}
                    onChange={(value) => setEditForm({...editForm, linked_account_id: value})}
                    options={[
                      { value: '', label: '-- Sin vincular --' },
                      ...accounts.filter(a => a.id !== editingAccount?.id).map(acc => ({ value: acc.id, label: `${acc.name} (${acc.account_type.replace('_', ' ')})` }))
                    ]}
                  />
                </div>

                {/* Credit Card Specifics */}
                {editForm.account_type === 'credit_card' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-6 pt-4 border-t border-white/5"
                  >
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                          Día de Corte
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={editForm.statement_day}
                          onChange={e => setEditForm({...editForm, statement_day: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                          Límite de Pago
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={editForm.payment_day}
                          onChange={e => setEditForm({...editForm, payment_day: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        Cupo de Crédito Otorgado
                      </label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editForm.credit_limit}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.,]/g, '');
                            setEditForm({...editForm, credit_limit: val});
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className="flex items-center gap-4 bg-white/5 p-5 rounded-[2rem] border border-white/10 group cursor-pointer" onClick={() => setEditForm({...editForm, is_active: !editForm.is_active})}>
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${editForm.is_active ? 'bg-blue-500 border-blue-500' : 'bg-transparent border-white/20'}`}>
                    {editForm.is_active && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-black text-white uppercase tracking-widest block leading-none mb-1">Cuenta Operativa</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Si está desactivada, no se sumará al patrimonio total</span>
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="p-7 border-t border-white/5 bg-slate-900/50 flex items-center gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={onSubmit}
                disabled={saving}
                className="flex-[2] py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white transition-all text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
              >
                {saving ? (
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando...
                  </div>
                ) : (
                  'Actualizar Datos'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EditAccountModal;
