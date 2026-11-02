import Modal from './common/Modal';
import { useState, useEffect, useId, useRef } from 'react';
import { X, Plus, Trash2, DollarSign, Calendar, Tag, CreditCard, Layers, Target, Info, TrendingUp, CheckCircle, RefreshCw, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Category, Account, TransactionType, PaymentMethod, ExpenseType, TransactionSplit as TransactionSplitType, Goal } from '../types';
import Select from './common/Select';
import DatePicker from './common/DatePicker';

export interface TransactionFormData {
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
  id: string;
  amount: string;
  category_id: string;
  description: string;
}

const createEmptySplit = (): TransactionSplit => ({
  id: globalThis.crypto.randomUUID(),
  amount: '',
  category_id: '',
  description: '',
});

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
  const formId = useId();
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [form, setForm] = useState<TransactionFormData>(initialData);
  const [isSplitEnabled, setIsSplitEnabled] = useState(false);
  const [splits, setSplits] = useState<TransactionSplit[]>(() => [createEmptySplit()]);

  useEffect(() => {
    void Promise.resolve().then(() => setForm(initialData));
  }, [initialData]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (initialSplits && initialSplits.length > 0) {
        setSplits(initialSplits.map(split => ({
          id: split.id,
          // Backend returns cents, divide by 100 for display
          amount: (split.amount / 100).toString(),
          category_id: split.category_id?.toString() || '',
          description: split.description || ''
        })));
        setIsSplitEnabled(true);
      } else {
        setSplits([createEmptySplit()]);
        setIsSplitEnabled(false);
      }
    });
  }, [initialSplits]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || submittingRef.current) return;
    const amount = form.amount.trim().replace(',', '.');
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setSubmitError('Ingresa un monto mayor que cero, con hasta dos decimales.');
      return;
    }
    if (isSplitEnabled) {
      const splitTotal = splits.reduce((sum, split) => sum + Math.round(Number(split.amount.replace(',', '.')) * 100), 0);
      if (!Number.isFinite(splitTotal) || splitTotal !== Math.round(Number(amount) * 100)) {
        setSubmitError('La suma de los conceptos debe coincidir con el monto de la transacción. Revisa los importes.');
        return;
      }
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit({ ...form, amount }, isSplitEnabled ? splits : undefined);
    } catch {
      setSubmitError('No se pudo guardar. Tus datos se conservan; vuelve a intentarlo.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const addSplitRow = () => {
    setSplits([...splits, createEmptySplit()]);
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
    return splits.reduce((sum, s) => sum + Number.parseFloat(s.amount || '0'), 0);
  };

  return (
    <Modal onClose={() => { if (!saving && !submitting) onCancel(); }} label={title}>
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 15 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="bg-surface border border-line rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col  relative overflow-hidden"
      >
        {/* Header con estilo Glass */}
        <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-line shrink-0">

          <div>
            <h2 className="text-xl font-black text-primary tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center border border-line">
                <Layers className="w-5 h-5 text-accent-strong" />
              </div>
              {title}
            </h2>
          </div>
          <button aria-label="Cerrar diálogo" disabled={saving || submitting}
            onClick={onCancel}
            className="w-10 h-10 rounded-full hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all border border-transparent hover:border-line"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id={formId} onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">

          {/* SECCIÓN HERO: MONTO */}
          <div className="relative group">

            <div className="relative bg-surface-soft rounded-3xl p-6 border border-line">
              <label htmlFor="transaction-amount" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-4">
                <DollarSign className="w-3 h-3" />
                Monto de la Transacción
              </label>
              <div className="flex items-center">
                <span className={`text-4xl font-black mr-2 ${form.transaction_type === 'income' ? 'text-success' : 'text-danger'}`}>$</span>
                <input
                  type="text"
                  id="transaction-amount"
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]{1,2})?"
                  required
                  value={form.amount}
                  onChange={e => {
                    // Solo permitir números, puntos y comas
                    const val = e.target.value.replace(/[^0-9.,]/g, '');
                    setForm({ ...form, amount: val });
                  }}
                  className={`w-full bg-transparent border-none text-5xl font-black focus:ring-0 placeholder-muted ${form.transaction_type === 'income' ? 'text-success' : 'text-danger'}`}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Descripción */}
            <div className="col-span-full">
              <label htmlFor="transactionform-field-1" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                <Info className="w-3 h-3" />
                Descripción
              </label>
              <input id="transactionform-field-1"
                type="text"
                required
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line focus:bg-surface-soft transition-all font-medium"
                placeholder="¿En qué se usó el dinero?"
              />
            </div>

            {/* Beneficiario (solo si existe — importaciones bancarias) */}
            {form.beneficiary && (
              <div className="col-span-full">
                <label className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                  <User className="w-3 h-3" />
                  Beneficiario
                </label>
                <div className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-3 text-muted text-xs font-mono">
                  {form.beneficiary}
                </div>
              </div>
            )}

            {/* Fecha */}
            <div>
              <label htmlFor="transaction-date" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                <Calendar className="w-3 h-3" />
                Fecha
              </label>
              <div className="relative">
                <DatePicker id="transaction-date" required
                  value={form.date ? form.date.substring(0, 10) : ''}
                  onChange={value => setForm({ ...form, date: value })}
                  placeholder="Seleccionar fecha"
                />
              </div>
            </div>

            {/* Método de Pago */}
            <div>
              <label htmlFor="transactionform-field-2" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                <CreditCard className="w-3 h-3" />
                Método de Pago
              </label>
              <Select id="transactionform-field-2"
                aria-label="Método de pago"
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
              <label htmlFor="transactionform-field-3" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                <Layers className="w-3 h-3" />
                Tipo de Flujo
              </label>
              <Select id="transactionform-field-3"
                aria-label="Tipo de flujo"
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
                <label htmlFor="transactionform-field-4" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                  <TrendingUp className="w-3 h-3" />
                  Naturaleza
                </label>
                <Select id="transactionform-field-4"
                  aria-label="Naturaleza del gasto"
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
              <label htmlFor="transactionform-field-5" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                <Tag className="w-3 h-3" />
                Categoría
              </label>
              <Select id="transactionform-field-5"
                aria-label="Categoría"
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
              <label htmlFor="transactionform-field-6" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                <CreditCard className="w-3 h-3" />
                Cuenta / Billetera
              </label>
              <Select id="transactionform-field-6"
                aria-label="Cuenta o billetera"
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
            <label htmlFor="transactionform-field-7" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
              <Target className="w-3 h-3" />
              Meta Vinculada
            </label>
            <Select id="transactionform-field-7"
              aria-label="Meta vinculada"
              value={form.goal_id || ''}
              onChange={(value) => setForm({ ...form, goal_id: value || undefined })}
              options={[
                { value: '', label: 'Sin meta' },
                ...goals.map(g => ({ value: g.id, label: g.name }))
              ]}
            />
          </div>

          {/* Split Transaction Toggle */}
          <button
            type="button"
            aria-pressed={isSplitEnabled}
            onClick={() => setIsSplitEnabled(!isSplitEnabled)}
            className={`w-full flex items-center justify-between p-5 rounded-3xl border cursor-pointer transition-all text-left ${
              isSplitEnabled
                ? 'bg-accent-soft border-line'
                : 'bg-surface-soft border-line hover:border-line'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isSplitEnabled ? 'bg-accent-soft border-line' : 'bg-surface-soft border-line'
              }`}>
                <Plus className={`w-5 h-5 ${isSplitEnabled ? 'text-accent-strong' : 'text-muted'}`} />
              </div>
              <div>
                <p className="text-sm font-bold text-primary">Dividir Transacción</p>
                <p className="text-xs text-muted font-medium uppercase tracking-wider">Múltiples categorías</p>
              </div>
            </div>
            <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
              isSplitEnabled ? 'bg-accent-strong border-line' : 'border-line'
            }`}>
              {isSplitEnabled && <CheckCircle className="w-4 h-4 text-primary" />}
            </div>
          </button>

          {/* Split Rows */}
          <AnimatePresence>
            {isSplitEnabled && (
              <motion.div
                initial={false}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 p-6 bg-surface-soft rounded-2xl border border-line"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black text-muted uppercase tracking-widest">Divisiones</span>
                  <div className="px-3 py-1 bg-surface-soft rounded-full border border-line">
                    <span className={`text-xs font-bold ${Math.abs(getSplitTotal() - Number.parseFloat(form.amount || '0')) < 0.01 ? 'text-success' : 'text-warning'}`}>
                      ${getSplitTotal().toFixed(2)} / ${Number.parseFloat(form.amount || '0').toFixed(2)}
                    </span>
                  </div>
                </div>

                {splits.map((split, index) => (
                  <div key={split.id} className="space-y-3 p-4 bg-surface-soft rounded-2xl border border-line relative">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`split-amount-${index}`} className="text-xs font-bold text-muted uppercase mb-2 block">Monto</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
                          <input
                            id={`split-amount-${index}`}
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]+([.,][0-9]{1,2})?"
                            value={split.amount}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.,]/g, '');
                              updateSplit(index, 'amount', val);
                            }}
                            className="w-full bg-canvas border border-line rounded-xl pl-6 pr-4 py-2 text-primary text-sm focus:outline-none focus:border-line transition-all"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor={`split-category-${index}`} className="text-xs font-bold text-muted uppercase mb-2 block">Categoría</label>
                        <Select
                          id={`split-category-${index}`}
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
                      <label htmlFor={`split-description-${index}`} className="text-xs font-bold text-muted uppercase mb-2 block">Descripción opcional</label>
                      <input
                        id={`split-description-${index}`}
                        type="text"
                        value={split.description}
                        onChange={(e) => updateSplit(index, 'description', e.target.value)}
                        className="w-full bg-canvas border border-line rounded-xl px-4 py-2 text-primary text-sm focus:outline-none focus:border-line transition-all"
                        placeholder="Detalle de este split"
                      />
                    </div>
                    {splits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSplitRow(index)}
                        className="absolute -top-2 -right-2 w-7 h-7 bg-danger text-on-color rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addSplitRow}
                  className="w-full py-3 bg-surface-soft hover:bg-surface-soft border border-dashed border-line rounded-2xl text-xs font-bold text-accent-strong transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Añadir otro Concepto
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {submitError && <p role="alert" className="text-danger px-6 py-3 text-sm">{submitError}</p>}
        {/* Footer con botones prominentes */}
        <div className="p-7 border-t border-line bg-canvas flex items-center gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 rounded-2xl border border-line text-muted hover:text-primary hover:bg-surface-soft transition-all text-xs font-black uppercase tracking-widest"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={saving || submitting}
            className="app-btn app-btn-primary flex-[2]"
          >
            {saving || submitting ? (
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
    </Modal>
  );
};

export default TransactionForm;
