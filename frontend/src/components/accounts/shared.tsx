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
    case 'checking': return 'from-blue-600/20 to-indigo-600/20 border-blue-500/30 text-blue-400';
    case 'savings': return 'from-emerald-600/20 to-teal-600/20 border-emerald-500/30 text-emerald-400';
    case 'credit_card': return 'from-purple-600/20 to-rose-600/20 border-purple-500/30 text-purple-400';
    case 'investment': return 'from-amber-600/20 to-orange-600/20 border-amber-500/30 text-amber-400';
    default: return 'from-slate-600/20 to-slate-800/20 border-slate-500/30 text-slate-400';
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
