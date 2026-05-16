import { useState, useEffect } from 'react';
import { X, Plus, Trash2, DollarSign, Calendar, Tag, CreditCard, Layers, Target, Info, TrendingUp, CheckCircle, RefreshCw, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Category, Account, TransactionType, PaymentMethod, ExpenseType, TransactionSplit as TransactionSplitType, Goal } from '../types';
import Select from './common/Select';
import DatePicker from './common/DatePicker';

interface TransactionFormData {
  description: string;
  amount: string;
  transaction_type: TransactionType;
  payment_method: PaymentMethod;
  date: string;
  category_id: string;
  account_id: string;
  expense_type: ExpenseType;
  goal_id?: string;
  beneficiary?: string;
}

interface TransactionSplit {
  amount: string;
  category_id: string;
  description: string;
}

interface TransactionFormProps {
  initialData: TransactionFormData;
  initialSplits?: TransactionSplitType[];
  categories: Category[];
  accounts: Account[];
  goals?: Goal[];
  onSubmit: (data: TransactionFormData, splits?: TransactionSplit[]) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  title: string;
}

const TransactionForm = ({
  initialData,
  initialSplits,
  categories,
  accounts,
  goals = [],
  onSubmit,
  onCancel,
  saving,
  title
}: TransactionFormProps) => {
  const [form, setForm] = useState<TransactionFormData>(initialData);
  const [isSplitEnabled, setIsSplitEnabled] = useState(false);
  const [splits, setSplits] = useState<TransactionSplit[]>([
    { amount: '', category_id: '', description: '' }
  ]);

  // Bloquear scroll del body cuando el modal está activo
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  useEffect(() => {
    setForm(initialData);
  }, [initialData]);

  useEffect(() => {
    if (initialSplits && initialSplits.length > 0) {
      setSplits(initialSplits.map(split => ({
        // Backend returns cents, divide by 100 for display
        amount: (split.amount / 100).toString(),
        category_id: split.category_id?.toString() || '',
        description: split.description || ''
      })));
      setIsSplitEnabled(true);
    } else {
      setSplits([{ amount: '', category_id: '', description: '' }]);
      setIsSplitEnabled(false);
    }
  }, [initialSplits]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate splits if enabled
    if (isSplitEnabled) {
      const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount || '0'), 0);
      const transactionAmount = parseFloat(form.amount);
      
      if (Math.abs(splitTotal - transactionAmount) > 0.01) {
        alert(`La suma de los splits (${splitTotal.toFixed(2)}) debe ser igual al monto de la transacción (${transactionAmount.toFixed(2)})`);
        return;
      }
      
      await onSubmit(form, splits);
    } else {
      await onSubmit(form);
    }
  };

  const addSplitRow = () => {
    setSplits([...splits, { amount: '', category_id: '', description: '' }]);
  };

  const removeSplitRow = (index: number) => {
    if (splits.length > 1) {
      setSplits(splits.filter((_, i) => i !== index));
    }
  };

  const updateSplit = (index: number, field: keyof TransactionSplit, value: string) => {
    const newSplits = [...splits];
    newSplits[index][field] = value;
    setSplits(newSplits);
  };

  const getSplitTotal = () => {
    return splits.reduce((sum, s) => sum + parseFloat(s.amount || '0'), 0);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      style={{ willChange: 'opacity, backdrop-filter' }}
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4 lg:p-6 overflow-hidden"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 15 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] w-full max-w-xl max-h-[90vh] flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
      >
        {/* Header con estilo Glass */}
        <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-white/5 shrink-0">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <Layers className="w-5 h-5 text-indigo-400" />
              </div>
              {title}
            </h2>
          </div>
          <button 
            onClick={onCancel} 
            className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">
          
          {/* SECCIÓN HERO: MONTO */}
          <div className="relative group">
            <div className={`absolute -inset-1 bg-gradient-to-r ${form.transaction_type === 'income' ? 'from-emerald-500/20 to-teal-500/20' : 'from-rose-500/20 to-orange-500/20'} rounded-3xl blur opacity-25 group-focus-within:opacity-100 transition duration-1000 group-focus-within:duration-200`}></div>
            <div className="relative bg-black/20 rounded-3xl p-6 border border-white/5">
              <label className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4">
                <DollarSign className="w-3 h-3" />
                Monto de la Transacción
              </label>
              <div className="flex items-center">
                <span className={`text-4xl font-black mr-2 ${form.transaction_type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  autoFocus
                  value={form.amount}
                  onChange={e => {
                    // Solo permitir números, puntos y comas
                    const val = e.target.value.replace(/[^0-9.,]/g, '');
                    setForm({ ...form, amount: val });
                  }}
                  className={`w-full bg-transparent border-none text-5xl font-black focus:ring-0 placeholder-white/5 ${form.transaction_type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Descripción */}
            <div className="col-span-full">
              <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                <Info className="w-3 h-3" />
                Descripción
              </label>
              <input
                type="text"
                required
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all font-medium"
                placeholder="¿En qué se usó el dinero?"
              />
            </div>

            {/* Beneficiario (solo si existe — importaciones bancarias) */}
            {form.beneficiary && (
              <div className="col-span-full">
                <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                  <User className="w-3 h-3" />
                  Beneficiario
                </label>
                <div className="w-full bg-white/3 border border-white/5 rounded-2xl px-5 py-3 text-slate-400 text-xs font-mono">
                  {form.beneficiary}
                </div>
              </div>
            )}

            {/* Fecha */}
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                <Calendar className="w-3 h-3" />
                Fecha
              </label>
              <div className="relative">
                <DatePicker
                  value={form.date ? form.date.split('T')[0] : ''}
                  onChange={(value) => {
                    const now = new Date();
                    const selectedDate = new Date(value);
                    const combinedDateTime = new Date(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth(),
                      selectedDate.getDate(),
                      now.getHours(),
                      now.getMinutes(),
                      now.getSeconds()
                    );
                    setForm({ ...form, date: combinedDateTime.toISOString() });
                  }}
                  placeholder="Seleccionar fecha"
                />
              </div>
            </div>

            {/* Método de Pago */}
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                <CreditCard className="w-3 h-3" />
                Método de Pago
              </label>
              <Select
                value={form.payment_method}
                onChange={(value) => setForm({ ...form, payment_method: value as PaymentMethod })}
                options={[
                  { value: 'transfer', label: 'Transferencia' },
                  { value: 'cash', label: 'Efectivo' },
                  { value: 'credit_card', label: 'T. Crédito' },
                  { value: 'debit_card', label: 'T. Débito' },
                  { value: 'other', label: 'Otro' }
                ]}
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                <Layers className="w-3 h-3" />
                Tipo de Flujo
              </label>
              <Select
                value={form.transaction_type}
                onChange={(value) => setForm({ ...form, transaction_type: value as TransactionType })}
                options={[
                  { value: 'expense', label: 'Gasto' },
                  { value: 'income', label: 'Ingreso' }
                ]}
              />
            </div>

            {/* Tipo de Gasto (Solo si es gasto) */}
            {form.transaction_type === 'expense' && (
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                  <TrendingUp className="w-3 h-3" />
                  Naturaleza
                </label>
                <Select
                  value={form.expense_type}
                  onChange={(value) => setForm({ ...form, expense_type: value as ExpenseType })}
                  options={[
                    { value: 'fixed', label: 'Fijo / Recurrente' },
                    { value: 'variable', label: 'Variable' },
                    { value: 'occasional', label: 'Ocasional' }
                  ]}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Categoría */}
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                <Tag className="w-3 h-3" />
                Categoría
              </label>
              <Select
                value={form.category_id}
                onChange={(value) => setForm({ ...form, category_id: value })}
                options={[
                  { value: '', label: 'Sin categoría' },
                  ...categories.map(c => ({ value: c.id, label: c.name }))
                ]}
              />
            </div>

            {/* Cuenta */}
            <div>
              <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                <CreditCard className="w-3 h-3" />
                Cuenta / Billetera
              </label>
              <Select
                value={form.account_id}
                onChange={(value) => setForm({ ...form, account_id: value })}
                options={[
                  { value: '', label: 'Sin cuenta' },
                  ...accounts.map(a => ({ value: a.id, label: a.name }))
                ]}
              />
            </div>
          </div>

          {/* Meta */}
          <div>
            <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
              <Target className="w-3 h-3" />
              Meta Vinculada
            </label>
            <Select
              value={form.goal_id || ''}
              onChange={(value) => setForm({ ...form, goal_id: value || undefined })}
              options={[
                { value: '', label: 'Sin meta' },
                ...goals.map(g => ({ value: g.id, label: g.name }))
              ]}
            />
          </div>
          
          {/* Split Transaction Toggle */}
          <div 
            onClick={() => setIsSplitEnabled(!isSplitEnabled)}
            className={`flex items-center justify-between p-5 rounded-3xl border cursor-pointer transition-all ${
              isSplitEnabled 
                ? 'bg-indigo-500/10 border-indigo-500/30' 
                : 'bg-white/5 border-white/5 hover:border-white/10'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isSplitEnabled ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-white/5 border-white/10'
              }`}>
                <Plus className={`w-5 h-5 ${isSplitEnabled ? 'text-indigo-400' : 'text-slate-500'}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Dividir Transacción</p>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Múltiples categorías</p>
              </div>
            </div>
            <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
              isSplitEnabled ? 'bg-indigo-500 border-indigo-400' : 'border-white/20'
            }`}>
              {isSplitEnabled && <CheckCircle className="w-4 h-4 text-white" />}
            </div>
          </div>

          {/* Split Rows */}
          <AnimatePresence>
            {isSplitEnabled && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 p-6 bg-black/20 rounded-[2rem] border border-white/5"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black text-white/40 uppercase tracking-widest">Divisiones</span>
                  <div className="px-3 py-1 bg-white/5 rounded-full border border-white/5">
                    <span className={`text-[10px] font-bold ${Math.abs(getSplitTotal() - parseFloat(form.amount || '0')) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      ${getSplitTotal().toFixed(2)} / ${parseFloat(form.amount || '0').toFixed(2)}
                    </span>
                  </div>
                </div>

                {splits.map((split, index) => (
                  <div key={index} className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5 relative">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-white/20 uppercase mb-2 block">Monto</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={split.amount}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.,]/g, '');
                              updateSplit(index, 'amount', val);
                            }}
                            className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-6 pr-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-white/20 uppercase mb-2 block">Categoría</label>
                        <Select
                          value={split.category_id}
                          onChange={(value) => updateSplit(index, 'category_id', value)}
                          options={[
                            { value: '', label: 'Seleccionar' },
                            ...categories.map(c => ({ value: c.id, label: c.name }))
                          ]}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-white/20 uppercase mb-2 block">Descripción opcional</label>
                      <input
                        type="text"
                        value={split.description}
                        onChange={(e) => updateSplit(index, 'description', e.target.value)}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                        placeholder="Detalle de este split"
                      />
                    </div>
                    {splits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSplitRow(index)}
                        className="absolute -top-2 -right-2 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={addSplitRow}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-dashed border-white/10 rounded-2xl text-xs font-bold text-indigo-400 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Añadir otro Concepto
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {/* Footer con botones prominentes */}
        <div className="p-7 border-t border-white/5 bg-slate-900/50 flex items-center gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
          >
            Cancelar
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving}
            className={`flex-[2] py-4 rounded-2xl bg-gradient-to-r ${form.transaction_type === 'income' ? 'from-emerald-600 to-teal-600 shadow-emerald-900/20' : 'from-indigo-600 to-blue-600 shadow-indigo-900/20'} text-white transition-all text-xs font-black uppercase tracking-widest shadow-xl disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]`}
          >
            {saving ? (
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Procesando...
              </div>
            ) : (
              'Confirmar Transacción'
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TransactionForm;
