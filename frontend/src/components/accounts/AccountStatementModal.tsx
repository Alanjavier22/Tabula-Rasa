import Modal from '../common/Modal';
import type { Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, DollarSign, ShieldCheck, CheckCircle2, Calendar, AlignLeft, RefreshCw, X } from 'lucide-react';
import type { CreditCardStatement } from '../../types';
import Select from '../common/Select';

export interface StatementFormData {
  account_id: string;
  statement_balance: string;
  user_share: string;
  payment_due_date: string;
  cut_off_date: string;
  amount_paid: string;
  status: string;
  month: number;
  year: number;
  notes: string;
}

interface AccountStatementModalProps {
  isOpen: boolean;
  statementForm: StatementFormData;
  setStatementForm: Dispatch<SetStateAction<StatementFormData>>;
  editingStatement: CreditCardStatement | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const AccountStatementModal = ({ isOpen, statementForm, setStatementForm, editingStatement, saving, onClose, onSubmit }: AccountStatementModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose} label={'Estado de cuenta'}>
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-surface border border-line rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col "
          >
            {/* Header */}
            <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-line shrink-0">

              <h2 className="text-xl font-black text-primary tracking-tight flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center border border-line">
                  <Layers className="w-5 h-5 text-accent-strong" />
                </div>
                {editingStatement ? 'Editar Estado' : 'Nuevo Estado'}
              </h2>
              <button aria-label="Cerrar diálogo" onClick={onClose} className="w-10 h-10 rounded-full hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all border border-transparent hover:border-line">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="statement-balance" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    <DollarSign className="w-3 h-3" />
                    Saldo al Corte
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted font-bold">$</span>
                    <input
                      id="statement-balance"
                      type="text"
                      inputMode="decimal"
                      required
                      value={statementForm.statement_balance}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9.,]/g, '');
                        setStatementForm({...statementForm, statement_balance: val});
                      }}
                      className="w-full bg-surface-soft border border-line rounded-2xl pl-10 pr-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="statement-user-share" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    <ShieldCheck className="w-3 h-3" />
                    Tu Parte (Gasto Real)
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted font-bold">$</span>
                    <input
                      id="statement-user-share"
                      type="text"
                      inputMode="decimal"
                      required
                      value={statementForm.user_share}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9.,]/g, '');
                        setStatementForm({...statementForm, user_share: val});
                      }}
                      className="w-full bg-surface-soft border border-line rounded-2xl pl-10 pr-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="statement-amount-paid" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Monto ya Abonado
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted font-bold">$</span>
                  <input
                    id="statement-amount-paid"
                    type="text"
                    inputMode="decimal"
                    value={statementForm.amount_paid}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setStatementForm({...statementForm, amount_paid: val});
                    }}
                    className="w-full bg-surface-soft border border-line rounded-2xl pl-10 pr-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <span className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    <Calendar className="w-3 h-3" />
                    Periodo (Mes/Año)
                  </span>
                  <div className="flex gap-2">
                    <input
                      id="statement-month"
                      aria-label="Mes del estado de cuenta"
                      type="number"
                      min="1"
                      max="12"
                      required
                      value={statementForm.month}
                      onChange={e => setStatementForm({...statementForm, month: Number.parseInt(e.target.value)})}
                      className="w-1/2 bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                    />
                    <input
                      id="statement-year"
                      aria-label="Año del estado de cuenta"
                      type="number"
                      min="2020"
                      max="2030"
                      required
                      value={statementForm.year}
                      onChange={e => setStatementForm({...statementForm, year: Number.parseInt(e.target.value)})}
                      className="w-1/2 bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="statement-status" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    Estado de Pago
                  </label>
                  <Select
                    id="statement-status"
                    value={statementForm.status}
                    onChange={(value) => setStatementForm({...statementForm, status: value})}
                    options={[
                      { value: 'pending', label: 'Pendiente' },
                      { value: 'partial', label: 'Pago Parcial' },
                      { value: 'paid', label: 'Pagado' }
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label htmlFor="statement-cut-off-date" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    Fecha de Corte
                  </label>
                  <input
                    id="statement-cut-off-date"
                    type="date"
                    value={statementForm.cut_off_date}
                    onChange={e => setStatementForm({...statementForm, cut_off_date: e.target.value})}
                    className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-medium [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label htmlFor="statement-payment-due-date" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    Límite de Pago
                  </label>
                  <input
                    id="statement-payment-due-date"
                    type="date"
                    value={statementForm.payment_due_date}
                    onChange={e => setStatementForm({...statementForm, payment_due_date: e.target.value})}
                    className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-medium [color-scheme:dark]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="statement-notes" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                  <AlignLeft className="w-3 h-3" />
                  Notas Adicionales
                </label>
                <textarea
                  id="statement-notes"
                  value={statementForm.notes}
                  onChange={e => setStatementForm({...statementForm, notes: e.target.value})}
                  className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-medium resize-none"
                  rows={3}
                  placeholder="Opcional..."
                />
              </div>
            </form>

            {/* Footer */}
            <div className="p-7 border-t border-line bg-canvas flex items-center gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-4 rounded-2xl border border-line text-muted hover:text-primary hover:bg-surface-soft transition-all text-xs font-black uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={onSubmit}
                disabled={saving}
                className="flex-[2] py-4 rounded-2xl bg-surface-soft   text-primary transition-all text-xs font-black uppercase tracking-widest shadow-xl  disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
              >
                {saving ? (
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando...
                  </div>
                ) : (
                  'Registrar Corte'
                )}
              </button>
            </div>
          </motion.div>
        </Modal>
      )}
    </AnimatePresence>
  );
};

export default AccountStatementModal;
