import { memo } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Edit2,
  Trash,
  AlertTriangle,
} from "lucide-react";
import { formatMoney } from "../../utils/money";
import type { Transaction } from "../../types";

interface TransactionRowProps {
  transaction: Transaction;
  rowHeight?: number;
  position?: number;
  total?: number;
  onEdit?: (txn: Transaction) => void;
  onDelete?: (id: string) => void;
}

const paymentLabels: Record<string, string> = {
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  transfer: "Transferencia",
  other: "Otro",
};

// Default shallow comparison includes callbacks and nested category changes.
export const TransactionRow = memo(
  ({
    transaction,
    rowHeight = 132,
    position,
    total,
    onEdit,
    onDelete,
  }: TransactionRowProps) => {
    const isIncome = transaction.transaction_type === "income";
    const description = transaction.description || "Sin descripción";
    const day = transaction.date.slice(0, 10);
    return (
      <div
        className="transaction-row"
        style={{ height: rowHeight }}
        role="listitem"
        aria-posinset={position}
        aria-setsize={total}
      >
        <div
          className={`transaction-direction ${isIncome ? "text-success" : "text-muted"}`}
          aria-label={isIncome ? "Ingreso" : "Gasto"}
        >
          {isIncome ? (
            <ArrowDownLeft aria-hidden="true" />
          ) : (
            <ArrowUpRight aria-hidden="true" />
          )}
        </div>
        <div className="transaction-copy">
          <strong title={description}>{description}</strong>
          <p title={transaction.beneficiary || undefined}>
            {transaction.beneficiary ||
              transaction.category?.name ||
              "Sin categoría"}
          </p>
          <div>
            <time dateTime={transaction.date}>{day}</time>
            <span>{paymentLabels[transaction.payment_method] ?? "Otro"}</span>
            {transaction.needs_clarification && (
              <span className="text-warning">
                <AlertTriangle aria-hidden="true" />
                Revisar categoría
              </span>
            )}
          </div>
        </div>
        <span
          className={`transaction-amount ${isIncome ? "text-success" : "text-primary"}`}
        >
          {isIncome ? "+" : "−"}$ {formatMoney(transaction.amount)}
        </span>
        <div className="transaction-row-actions">
          {onEdit && (
            <button
              type="button"
              className="app-icon-button"
              aria-label={`Editar ${description}`}
              title="Editar"
              onClick={() => onEdit(transaction)}
            >
              <Edit2 aria-hidden="true" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="app-icon-button"
              aria-label={`Eliminar ${description}`}
              title="Eliminar"
              onClick={() => onDelete(transaction.id)}
            >
              <Trash aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  },
);
TransactionRow.displayName = "TransactionRow";
