import { Wallet, CreditCard, PiggyBank, TrendingUp, DollarSign } from 'lucide-react';

export interface AccountFormData {
  name: string;
  account_type: string;
  balance: string;
  currency: string;
  credit_limit: string;
  bank_name: string;
  description: string;
  is_active: boolean;
  linked_account_id: string;
  statement_day: string;
  payment_day: string;
}

export const getAccountStyle = (type: string) => {
  switch (type) {
    case 'checking': return '  border-line text-info';
    case 'savings': return '  border-line text-success';
    case 'credit_card': return '  border-line text-accent-strong';
    case 'investment': return '  border-line text-warning';
    default: return '  border-line text-muted';
  }
};

export const getAccountAccent = (type: string) => {
  switch (type) {
    case 'checking': return 'var(--app-info)';
    case 'savings': return 'var(--app-success)';
    case 'credit_card': return 'var(--app-accent-strong)';
    case 'investment': return 'var(--app-warning)';
    default: return 'var(--app-muted)';
  }
};

export const getAccountTypeLabel = (type: string) => {
  switch (type) {
    case 'checking': return 'Cuenta corriente';
    case 'savings': return 'Cuenta de ahorro';
    case 'credit_card': return 'Tarjeta de crédito';
    case 'investment': return 'Inversión';
    default: return 'Cuenta financiera';
  }
};

export const getAccountIcon = (type: string) => {
  switch (type) {
    case 'checking': return <Wallet className="w-6 h-6" />;
    case 'savings': return <PiggyBank className="w-6 h-6" />;
    case 'credit_card': return <CreditCard className="w-6 h-6" />;
    case 'investment': return <TrendingUp className="w-6 h-6" />;
    default: return <DollarSign className="w-6 h-6" />;
  }
};
