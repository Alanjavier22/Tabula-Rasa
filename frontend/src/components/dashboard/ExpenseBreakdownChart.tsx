import type { DashboardSummaryResponse } from "../../types";
import { formatMoney } from "../../utils/money";
import SkeletonChart from "./SkeletonChart";

interface ExpenseBreakdownChartProps {
  dashboardSummary: DashboardSummaryResponse | undefined;
  expenseBreakdown: DashboardSummaryResponse["expense_breakdown"];
}

const ExpenseBreakdownChart = ({
  dashboardSummary,
  expenseBreakdown,
}: ExpenseBreakdownChartProps) => {
  const items = expenseBreakdown
    .map((item) => ({ ...item, amount: Number(item.value) }))
    .filter((item) => Number.isFinite(item.amount))
    .sort((a, b) => b.amount - a.amount);
  const largest = Math.max(1, ...items.map((item) => item.amount));
  const total = items.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  return (
    <section
      className="app-surface app-chart-panel"
      aria-label="Gastos por categoría"
    >
      <h3>Gastos por categoría</h3>
      {!dashboardSummary ? (
        <SkeletonChart height="h-56" />
      ) : items.length ? (
        <ol className="expense-ranking">
          {items.map((item) => (
            <li key={item.name}>
              <div>
                <span>{item.name}</span>
                <strong>$ {formatMoney(item.amount)}</strong>
                <span className="text-muted">
                  {total > 0 && item.amount >= 0
                    ? `${Math.round((item.amount / total) * 100)}%`
                    : "—"}
                </span>
              </div>
              <div className="expense-bar-track" aria-hidden="true">
                <div
                  style={{
                    width: `${(Math.max(0, item.amount) / largest) * 100}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="app-inline-message">
          No hay gastos en este periodo. Los movimientos registrados aparecerán
          aquí por categoría.
        </p>
      )}
    </section>
  );
};
export default ExpenseBreakdownChart;
