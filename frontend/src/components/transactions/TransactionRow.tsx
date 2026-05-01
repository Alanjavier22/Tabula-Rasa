/**
 * TransactionRow - FASE 2: Memory-safe virtualized row component
 * Optimized for high-frequency recycling during scroll
 * React.memo with custom comparison prevents unnecessary re-renders
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { formatMoney } from '../../utils/money';
import type { LocalTransaction } from '../../db/db';

interface TransactionRowProps {
  transaction: LocalTransaction & { category?: any };
  onEdit?: (txn: LocalTransaction & { category?: any }) => void;
  onDelete?: (id: string) => void;
}

/**
 * Custom comparison function for React.memo
 * Only re-render if critical fields change: version, hash, needs_review, amount, description
 * This prevents re-renders when parent component updates for unrelated reasons
 */
const arePropsEqual = (prevProps: TransactionRowProps, nextProps: TransactionRowProps) => {
  const prev = prevProps.transaction;
  const next = nextProps.transaction;

  return (
    prev.id === next.id &&
    prev.version === next.version &&
    prev.hash === next.hash &&
    prev.needs_review === next.needs_review &&
    prev.amount === next.amount &&
    prev.description === next.description &&
    prev.date === next.date &&
    prev.category_id === next.category_id
  );
};

/**
 * TransactionRow component with memory leak prevention
 * 
 * Memory leak safeguards:
 * - No useEffect with scroll/resize/intersection observers in this component
 * - All event handlers are stable functions passed from parent
 * - Framer Motion uses layout="position" to avoid expensive layout recalculations
 */
export const TransactionRow = memo<TransactionRowProps>(({ transaction, onEdit, onDelete }) => {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{ height: '60px', borderBottom: '1px solid #e5e7eb' }}
      className="flex items-center justify-between px-4 py-2 bg-white hover:bg-gray-50"
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{transaction.description || 'Sin descripción'}</p>
        <p className="text-xs text-gray-500">{transaction.date}</p>
        {transaction.category && (
          <p className="text-xs text-gray-400">{transaction.category.name || ''}</p>
        )}
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${transaction.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
          {transaction.transaction_type === 'income' ? '+' : '-'}{formatMoney(transaction.amount)}
        </p>
        {onEdit && onDelete && (
          <div className="flex gap-2 justify-end mt-1">
            <button
              onClick={() => onEdit(transaction)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Editar
            </button>
            <button
              onClick={() => onDelete(transaction.id)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}, arePropsEqual);

TransactionRow.displayName = 'TransactionRow';
