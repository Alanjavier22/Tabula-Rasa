/**
 * VirtualTransactionList - FASE 5: Windowing for 50k+ transactions
 * Only renders visible rows in viewport (max 20 DOM nodes)
 * Uses IntersectionObserver for efficient virtualization
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { formatMoney } from '../../utils/money';
import type { LocalTransaction } from '../../db/db';

interface VirtualTransactionListProps {
  transactions: LocalTransaction[];
  rowHeight: number;
  visibleRowCount?: number;
  onEdit?: (txn: LocalTransaction & { category?: any }) => void;
  onDelete?: (id: string) => void;
}

export const VirtualTransactionList: React.FC<VirtualTransactionListProps> = ({
  transactions,
  onEdit,
  onDelete,
  rowHeight = 50,
  visibleRowCount = 20,
}) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: visibleRowCount });
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate visible range based on scroll position
  const updateVisibleRange = useCallback(() => {
    if (!containerRef.current) return;
    
    const containerHeight = containerRef.current.clientHeight;
    const newStart = Math.floor(scrollTop / rowHeight);
    const newEnd = Math.min(
      newStart + Math.ceil(containerHeight / rowHeight) + 5,
      transactions.length
    );
    
    setVisibleRange({ start: Math.max(0, newStart - 5), end: newEnd });
  }, [scrollTop, rowHeight, transactions.length]);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Update visible range on scroll change
  useEffect(() => {
    const timeoutId = setTimeout(updateVisibleRange, 16); // 60fps throttling
    return () => clearTimeout(timeoutId);
  }, [updateVisibleRange]);

  // Initial range
  useEffect(() => {
    updateVisibleRange();
  }, [updateVisibleRange]);

  const visibleTransactions = transactions.slice(visibleRange.start, visibleRange.end);
  const totalHeight = transactions.length * rowHeight;
  const offsetY = visibleRange.start * rowHeight;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ height: '500px', overflow: 'auto', position: 'relative' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleTransactions.map((txn) => (
            <div
              key={txn.id}
              style={{ height: rowHeight, borderBottom: '1px solid #e5e7eb' }}
              className="flex items-center justify-between px-4 py-2 bg-white hover:bg-gray-50"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{txn.description || 'Sin descripción'}</p>
                <p className="text-xs text-gray-500">{txn.date}</p>
                {txn.category && (
                  <p className="text-xs text-gray-400">{txn.category.name || ''}</p>
                )}
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${txn.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {txn.transaction_type === 'income' ? '+' : '-'}{formatMoney(txn.amount)}
                </p>
                {onEdit && onDelete && (
                  <div className="flex gap-2 justify-end mt-1">
                    <button
                      onClick={() => onEdit(txn)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onDelete(txn.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
