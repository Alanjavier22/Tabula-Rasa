import { useRef, useState, useEffect } from "react";
import { TransactionRow } from "./TransactionRow";
import type { Transaction } from "../../types";

interface VirtualTransactionListProps {
  transactions: Transaction[];
  rowHeight: number;
  visibleRowCount?: number;
  onEdit?: (txn: Transaction) => void;
  onDelete?: (id: string) => void;
}

export const VirtualTransactionList = ({
  transactions,
  onEdit,
  onDelete,
  rowHeight,
  visibleRowCount = 8,
}: VirtualTransactionListProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const count = Math.max(visibleRowCount, Math.ceil(height / rowHeight));
  const first = Math.min(
    Math.floor(scrollTop / rowHeight),
    Math.max(0, transactions.length - count),
  );
  const start = Math.max(0, first - 3);
  const end = Math.min(first + count + 3, transactions.length);
  return (
    <div
      ref={containerRef}
      className="transactions-scroll"
      tabIndex={0}
      role="region"
      aria-label="Lista de transacciones; usa las teclas de desplazamiento para consultar más movimientos"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        role="list"
        aria-label="Transacciones"
        style={{
          height: transactions.length * rowHeight,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0 0 auto",
            transform: `translateY(${start * rowHeight}px)`,
          }}
        >
          {transactions.slice(start, end).map((transaction, index) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              rowHeight={rowHeight}
              position={start + index + 1}
              total={transactions.length}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
