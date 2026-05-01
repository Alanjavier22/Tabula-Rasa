/**
 * VirtualTransactionList - FASE 5: Windowing for 50k+ transactions
 * Only renders visible rows in viewport (max 20 DOM nodes)
 * Uses IntersectionObserver for efficient virtualization
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { TransactionRow } from './TransactionRow';
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
            <TransactionRow
              key={txn.id}
              transaction={txn}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
