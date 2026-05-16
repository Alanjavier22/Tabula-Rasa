import { memo } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Edit2, 
  Trash,
  Tag,
  HelpCircle
} from 'lucide-react';
import { formatMoney } from '../../utils/money';
import type { LocalTransaction } from '../../db/db';

interface TransactionRowProps {
  transaction: LocalTransaction & { category?: any };
  onEdit?: (txn: LocalTransaction & { category?: any }) => void;
  onDelete?: (id: string) => void;
}

const arePropsEqual = (prevProps: TransactionRowProps, nextProps: TransactionRowProps) => {
  const prev = prevProps.transaction;
  const next = nextProps.transaction;

  return (
    prev.id === next.id &&
    prev.version === next.version &&
    prev.hash === next.hash &&
    prev.needs_review === next.needs_review &&
    prev.needs_clarification === next.needs_clarification &&
    prev.amount === next.amount &&
    prev.description === next.description &&
    prev.date === next.date &&
    prev.category_id === next.category_id
  );
};

export const TransactionRow = memo<TransactionRowProps>(({ transaction, onEdit, onDelete }) => {
  const isIncome = transaction.transaction_type === 'income';

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-4 px-4 py-3 hover:bg-slate-800/40 border-b border-slate-700/30 transition-all group relative"
      style={{ height: '70px' }}
    >
      <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
        isIncome 
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
      }`}>
        {isIncome ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-bold text-white truncate leading-tight">
            {transaction.description || 'Sin descripción'}
          </p>
          {transaction.category && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-700/50 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
              <Tag className="w-2.5 h-2.5" />
              {transaction.category.name}
            </span>
          )}
          {transaction.needs_clarification && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 text-[10px] font-black text-amber-400 uppercase animate-pulse cursor-help" title="La IA no está segura de esta categoría o detectó un cobro auditable. Haz clic en editar para confirmar.">
              <HelpCircle className="w-2.5 h-2.5" />
              Revisar
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(transaction as any).beneficiary && (
            <>
              <p className="text-[11px] font-medium text-indigo-400/60 truncate max-w-[180px]" title={(transaction as any).beneficiary}>
                → {(transaction as any).beneficiary}
              </p>
              <span className="w-1 h-1 rounded-full bg-slate-700"></span>
            </>
          )}
          <p className="text-[11px] font-medium text-slate-500">{transaction.date}</p>
          <span className="w-1 h-1 rounded-full bg-slate-700"></span>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            {transaction.payment_method === 'cash' ? 'Efectivo' :
             transaction.payment_method === 'credit_card' ? 'T. Crédito' :
             transaction.payment_method === 'debit_card' ? 'T. Débito' :
             'Transferencia'}
          </p>
        </div>
      </div>

      <div className="flex-shrink-0 w-24 lg:w-32 text-right">
        <p className={`text-sm lg:text-base font-black tracking-tight ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isIncome ? '+' : '-'}${formatMoney(transaction.amount)}
        </p>
      </div>

      {onEdit && onDelete && (
        <div className="flex gap-1 flex-shrink-0 ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(transaction); }}
            className="p-2 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all border border-transparent hover:border-blue-500/20"
            title="Editar"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(transaction.id); }}
            className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20"
            title="Eliminar"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
}, arePropsEqual);

TransactionRow.displayName = 'TransactionRow';
