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
  const [viewport, setViewport] = useState({ offset: 0, height: 800 });
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const main = container.closest<HTMLElement>('.app-main');
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const mainIsScroller = main && getComputedStyle(main).overflowY === 'auto';
        const viewportTop = mainIsScroller ? main.getBoundingClientRect().top : 0;
        const viewportHeight = mainIsScroller ? main.clientHeight : window.innerHeight;
        setViewport({ offset: Math.max(0, viewportTop - rect.top), height: viewportHeight });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    if (main) observer.observe(main);
    const content = container.closest<HTMLElement>('.app-content');
    if (content) observer.observe(content);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(frame);
    };
  }, []);
  const count = Math.max(visibleRowCount, Math.ceil(viewport.height / rowHeight));
  const first = Math.min(Math.floor(viewport.offset / rowHeight), Math.max(0, transactions.length - count));
  const start = Math.max(0, first - 3);
  const end = Math.min(first + count + 3, transactions.length);
  return (
    <div
      ref={containerRef}
      className="transactions-scroll"
    >
      <div
        style={{
          height: transactions.length * rowHeight,
          position: "relative",
        }}
      >
        <ul aria-label="Transacciones" style={{ position: "absolute",
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
        </ul>
      </div>
    </div>
  );
};
