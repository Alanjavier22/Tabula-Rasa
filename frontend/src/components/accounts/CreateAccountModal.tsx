import Modal from '../common/Modal';
import type { Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, PiggyBank, DollarSign, Building2, Link, Info, CheckCircle2, RefreshCw, X } from 'lucide-react';
import type { Account } from '../../types';
import Select from '../common/Select';
import { type AccountFormData, getAccountStyle, getAccountIcon } from './shared';

interface CreateAccountModalProps {
  isOpen: boolean;
  form: AccountFormData;
  setForm: Dispatch<SetStateAction<AccountFormData>>;
  accounts: Account[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const CreateAccountModal = ({ isOpen, form, setForm, accounts, saving, onClose, onSubmit }: CreateAccountModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose} label={'Nueva cuenta'}>
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
                  <Wallet className="w-5 h-5 text-accent-strong" />
                </div>
                Nueva Cuenta
              </h2>
              <button aria-label="Cerrar diálogo" onClick={onClose} className="w-10 h-10 rounded-full hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all border border-transparent hover:border-line">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">

              {/* VISTA PREVIA DE TARJETA VIRTUAL */}
              <div className="space-y-3">
                <span className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide ml-1">
                  Vista Previa de Cuenta
                </span>
                <div className="bg-surface-soft rounded-3xl p-4 border border-line">
                  <div className={`aspect-[1.6/1] w-full rounded-2xl bg-surface-soft ${getAccountStyle(form.account_type)} p-6 border border-line relative overflow-hidden flex flex-col justify-between shadow-2xl`}>
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-10 rounded-xl bg-surface-soft flex items-center justify-center border border-line">
                        {getAccountIcon(form.account_type)}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black uppercase tracking-widest text-muted block">Banco</span>
                        <span className="text-xs font-bold text-primary">{form.bank_name || 'Nombre del Banco'}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-black uppercase tracking-widest text-muted block mb-1">Saldo Estimado</span>
                      <span className="text-3xl font-black text-primary tracking-tight">${form.balance || '0.00'}</span>
                    </div>

                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-muted tracking-tight">{form.name || 'Titular de la Cuenta'}</span>
                      <div className="px-2 py-1 bg-surface-soft rounded-lg border border-line">
                        <span className="text-xs font-black text-muted uppercase tracking-tight">
                          {form.account_type.replace('_', ' ')}
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
                    <label htmlFor="account-name" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                      <Building2 className="w-3 h-3" />
                      Alias de la Cuenta
                    </label>
                    <input
                      id="account-name"
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-medium"
                      placeholder="Ej: Ahorros Principal"
                    />
                  </div>
                  <div>
                    <label htmlFor="account-type" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                      <PiggyBank className="w-3 h-3" />
                      Tipo de Recurso
                    </label>
                    <Select
                      id="account-type"
                      value={form.account_type}
                      onChange={(value) => setForm({...form, account_type: value})}
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
                    <label htmlFor="account-balance" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                      <DollarSign className="w-3 h-3" />
                      Saldo Inicial
                    </label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted font-bold">$</span>
                      <input
                        id="account-balance"
                        type="text"
                        inputMode="decimal"
                        required
                        value={form.balance}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9.,]/g, '');
                          setForm({...form, balance: val});
                        }}
                        className="w-full bg-surface-soft border border-line rounded-2xl pl-10 pr-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="account-bank-name" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                      <Building2 className="w-3 h-3" />
                      Entidad Financiera
                    </label>
                    <input
                      id="account-bank-name"
                      type="text"
                      value={form.bank_name}
                      onChange={e => setForm({...form, bank_name: e.target.value})}
                      className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-medium"
                      placeholder="Ej: Banco Pichincha"
                    />
                  </div>
                </div>

                {/* Vinculación */}
                <div>
                  <label htmlFor="account-linked-account" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    <Link className="w-3 h-3" />
                    Cuenta Vinculada
                  </label>
                  <Select
                    id="account-linked-account"
                    value={form.linked_account_id}
                    onChange={(value) => setForm({...form, linked_account_id: value})}
                    options={[
                      { value: '', label: '-- Sin vincular --' },
                      ...accounts.map(acc => ({ value: acc.id, label: `${acc.name} (${acc.account_type.replace('_', ' ')})` }))
                    ]}
                  />
                  <div className="flex gap-2 mt-3 ml-1">
                    <Info className="w-3.5 h-3.5 text-info shrink-0" />
                    <p className="text-xs text-muted font-bold uppercase tracking-widest leading-relaxed">Útil para asociar tarjetas de crédito con su cuenta de pago</p>
                  </div>
                </div>

                {/* Credit Card Specifics */}
                {form.account_type === 'credit_card' && (
                  <motion.div
                    initial={false}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-6 pt-4 border-t border-line"
                  >
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="account-statement-day" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                          Día de Corte
                        </label>
                        <input
                          id="account-statement-day"
                          type="number"
                          min="1"
                          max="31"
                          value={form.statement_day}
                          onChange={e => setForm({...form, statement_day: e.target.value})}
                          className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                          placeholder="1-31"
                        />
                      </div>
                      <div>
                        <label htmlFor="account-payment-day" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                          Límite de Pago
                        </label>
                        <input
                          id="account-payment-day"
                          type="number"
                          min="1"
                          max="31"
                          value={form.payment_day}
                          onChange={e => setForm({...form, payment_day: e.target.value})}
                          className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                          placeholder="1-31"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="account-credit-limit" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                        Cupo de Crédito Otorgado
                      </label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted font-bold">$</span>
                        <input
                          id="account-credit-limit"
                          type="text"
                          inputMode="decimal"
                          value={form.credit_limit}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.,]/g, '');
                            setForm({...form, credit_limit: val});
                          }}
                          className="w-full bg-surface-soft border border-line rounded-2xl pl-10 pr-5 py-4 text-primary text-sm focus:outline-none focus:border-line transition-all font-bold"
                          placeholder="5000.00"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                <button
                  type="button"
                  aria-pressed={form.is_active}
                  className="w-full flex items-center gap-4 bg-surface-soft p-5 rounded-2xl border border-line group cursor-pointer text-left"
                  onClick={() => setForm({...form, is_active: !form.is_active})}
                >
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${form.is_active ? 'bg-success border-line' : 'bg-transparent border-line'}`}>
                    {form.is_active && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-black text-primary uppercase tracking-widest block leading-none mb-1">Cuenta Operativa</span>
                    <span className="text-xs text-muted font-bold uppercase tracking-widest">Si está desactivada, no se sumará al patrimonio total</span>
                  </div>
                </button>
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
                  'Confirmar Apertura'
                )}
              </button>
            </div>
          </motion.div>
        </Modal>
      )}
    </AnimatePresence>
  );
};

export default CreateAccountModal;
