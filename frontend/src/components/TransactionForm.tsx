import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { Category, Account, TransactionType, PaymentMethod, ExpenseType, TransactionSplit as TransactionSplitType } from '../types';

interface TransactionFormData {
  description: string;
  amount: string;
  transaction_type: TransactionType;
  payment_method: PaymentMethod;
  date: string;
  category_id: string;
  account_id: string;
  expense_type: ExpenseType;
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Descripción *</label>
            <input
              type="text"
              required
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              placeholder="Ej: Compra supermercado"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Fecha *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Tipo *</label>
              <select
                value={form.transaction_type}
                onChange={e => setForm({ ...form, transaction_type: e.target.value as TransactionType })}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Método de Pago</label>
              <select
                value={form.payment_method}
                onChange={e => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="credit_card">T. Crédito</option>
                <option value="debit_card">T. Débito</option>
                <option value="other">Otro</option>
              </select>
            </div>
          </div>
          {form.transaction_type === 'expense' && (
            <div>
              <label className="block text-sm text-slate-300 mb-1">Tipo de Gasto</label>
              <select
                value={form.expense_type}
                onChange={e => setForm({ ...form, expense_type: e.target.value as ExpenseType })}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="fixed">Fijo</option>
                <option value="variable">Variable</option>
                <option value="occasional">Ocasional</option>
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Categoría</label>
              <select
                value={form.category_id}
                onChange={e => setForm({ ...form, category_id: e.target.value })}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="">Sin categoría</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Cuenta</label>
              <select
                value={form.account_id}
                onChange={e => setForm({ ...form, account_id: e.target.value })}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="">Sin cuenta</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Split Transaction Toggle */}
          <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
            <input
              type="checkbox"
              id="split-toggle"
              checked={isSplitEnabled}
              onChange={(e) => setIsSplitEnabled(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <label htmlFor="split-toggle" className="text-sm text-slate-300 cursor-pointer">
              Dividir transacción en múltiples categorías
            </label>
          </div>

          {/* Split Rows */}
          {isSplitEnabled && (
            <div className="space-y-3 p-4 bg-slate-700/20 rounded-lg border border-slate-600">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">Divisiones</span>
                <span className="text-xs text-slate-400">
                  Total: ${getSplitTotal().toFixed(2)} / ${parseFloat(form.amount || '0').toFixed(2)}
                </span>
              </div>
              {splits.map((split, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <label className="block text-xs text-slate-400 mb-1">Monto</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={split.amount}
                      onChange={(e) => updateSplit(index, 'amount', e.target.value)}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="block text-xs text-slate-400 mb-1">Categoría</label>
                    <select
                      value={split.category_id}
                      onChange={(e) => updateSplit(index, 'category_id', e.target.value)}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500"
                    >
                      <option value="">Seleccionar</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <label className="block text-xs text-slate-400 mb-1">Descripción</label>
                    <input
                      type="text"
                      value={split.description}
                      onChange={(e) => updateSplit(index, 'description', e.target.value)}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500"
                      placeholder="Detalle"
                    />
                  </div>
                  <div className="col-span-1">
                    {splits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSplitRow(index)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addSplitRow}
                className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300"
              >
                <Plus className="w-4 h-4" />
                Agregar división
              </button>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TransactionForm;
