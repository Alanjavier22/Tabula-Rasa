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
  const topItem = items[0];
  const topShare =
    topItem && total > 0 ? Math.round((topItem.amount / total) * 100) : 0;


  function renderRanking() {
    if (!dashboardSummary) return (
        <SkeletonChart height="h-56" />
      );
    if (items.length) return (
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
      );
    return (
        <p className="app-inline-message">
          No hay gastos en este periodo. Los movimientos registrados aparecerán
          aquí por categoría.
        </p>
      );
  }
return (
    <section
      className="app-surface app-chart-panel"
      aria-label="Gastos por categoría"
    >
      <div className="chart-panel-head">
        <div>
          <span className="dashboard-panel-kicker">Distribución del mes</span>
          <h3>Gastos por categoría</h3>
        </div>
        {items.length > 0 && (
          <div className="chart-panel-head-stat">
            <span>Total categorizado</span>
            <strong>$ {formatMoney(total)}</strong>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="chart-kpi-strip">
          <div className="chart-kpi-item">
            <span>Mayor rubro</span>
            <strong>
              {topItem.name} ({topShare}%)
            </strong>
          </div>
          <div className="chart-kpi-item">
            <span>Categorías activas</span>
            <strong>{items.length}</strong>
          </div>
          <div className="chart-kpi-item">
            <span>Promedio por rubro</span>
            <strong>$ {formatMoney(Math.round(total / items.length))}</strong>
          </div>
        </div>
      )}

      {renderRanking()}
    </section>
  );
};
export default ExpenseBreakdownChart;
