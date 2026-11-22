import { type Dispatch, type SetStateAction } from 'react';
import { Layers, DollarSign, ShieldCheck, CheckCircle2, Calendar, AlignLeft } from 'lucide-react';
import type { CreditCardStatement } from '../../types';
import Select from '../common/Select';
import AccountModalShell from './AccountModalShell';

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
    <AccountModalShell
      isOpen={isOpen}
      label="Estado de cuenta"
      title={editingStatement ? 'Editar Estado' : 'Nuevo Estado'}
      icon={<Layers className="w-5 h-5 text-accent-strong" />}
      saving={saving}
      submitLabel="Registrar Corte"
      onClose={onClose}
      onSubmit={onSubmit}
    >

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
                    className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-medium"
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
                    className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-medium"
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
    </AccountModalShell>
  );
};

export default AccountStatementModal;
