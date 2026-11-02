import { useEffect, useState } from 'react';
import { metricsAPI } from '../services/api';
import { formatMoney, clampZero } from '../utils/money';
import { TrendingDown, AlertTriangle, CheckCircle, Sparkles } from 'lucide-react';

type SafeToSpendStatus = 'safe' | 'risk' | 'insolvent';

export interface SafeToSpendData {
  current_balance: number;
  projected_income: number;
  monthly_budgets: number;
  pending_debts: number;
  base_safe_to_spend: number;
  ai_adjusted_safe_to_spend: number;
  days_until_month_end: number;
  prediction: 'positive' | 'negative';
}

const SafeToSpendWidget = () => {
  const [data, setData] = useState<SafeToSpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string | null>(null);

  const fetchSafeToSpend = async () => {
    try {
      setLoading(true);
      const response = await metricsAPI.getSafeToSpend();
      const resData = response.data;
      const mappedData: SafeToSpendData = {
        current_balance: resData.current_balance,
        projected_income: resData.monthly_income,
        monthly_budgets: resData.projected_fixed_expenses,
        pending_debts: resData.pending_cc_payments,
        base_safe_to_spend: resData.safe_to_spend + resData.safe_to_spend_buffer,
        ai_adjusted_safe_to_spend: resData.safe_to_spend,
        days_until_month_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate(),
        prediction: resData.safe_to_spend >= 0 ? 'positive' : 'negative',
      };
      setData(mappedData);

      // Generate insight based on data
      if (mappedData.ai_adjusted_safe_to_spend < 0) {
        setInsight('Tu gasto proyectado supera tus ingresos. Considera reducir gastos no esenciales.');
      } else if (mappedData.ai_adjusted_safe_to_spend < mappedData.base_safe_to_spend * 0.3) {
        setInsight('Tu gasto en "Ocio" ha subido un 20% esta semana. Revisa tus presupuestos.');
      } else {
        setInsight('Tu flujo de caja es saludable. Mantén tus hábitos actuales.');
      }
    } catch (error) {
      console.error('Error fetching safe-to-spend:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchSafeToSpend);
  }, []);

  const getStatus = (): SafeToSpendStatus => {
    if (!data) return 'safe';

    const { ai_adjusted_safe_to_spend, base_safe_to_spend } = data;

    if (ai_adjusted_safe_to_spend < 0) return 'insolvent';
    if (ai_adjusted_safe_to_spend < base_safe_to_spend * 0.3) return 'risk';
    return 'safe';
  };

  const getStatusConfig = (status: SafeToSpendStatus) => {
    switch (status) {
      case 'safe':
        return {
          color: 'text-success',
          bg: 'bg-success-soft',
          border: 'border-line',
          icon: CheckCircle,
          label: 'Seguro',
        };
      case 'risk':
        return {
          color: 'text-warning',
          bg: 'bg-warning-soft',
          border: 'border-line',
          icon: AlertTriangle,
          label: 'Riesgo',
        };
      case 'insolvent':
        return {
          color: 'text-danger',
          bg: 'bg-danger-soft',
          border: 'border-line',
          icon: TrendingDown,
          label: 'Insolvencia',
        };
    }
  };

  if (loading) {
    return (
      <div className="bg-surface  rounded-2xl border border-line p-6">
        <div className="flex items-center justify-center h-32 text-muted">Cargando...</div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const status = getStatus();
  const config = getStatusConfig(status);
  const StatusIcon = config.icon;

  return (
    <div className={`bg-surface  rounded-2xl border ${config.border} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-full ${config.bg}`}>
            <StatusIcon className={`w-5 h-5 ${config.color}`} />
          </div>
          <h3 className="text-lg font-semibold text-primary">Safe-to-Spend</h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
          {config.label}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-sm text-muted mb-1">Balance disponible (ajustado)</p>
        <p className={`text-3xl font-bold ${config.color}`}>
          ${formatMoney(clampZero(data.ai_adjusted_safe_to_spend))}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <p className="text-muted text-xs">Balance actual</p>
          <p className="text-primary font-semibold">${formatMoney(data.current_balance)}</p>
        </div>
        <div>
          <p className="text-muted text-xs">Ingreso proyectado</p>
          <p className="text-success font-semibold">${formatMoney(data.projected_income)}</p>
        </div>
        <div>
          <p className="text-muted text-xs">Presupuestos mensuales</p>
          <p className="text-primary font-semibold">${formatMoney(data.monthly_budgets)}</p>
        </div>
        <div>
          <p className="text-muted text-xs">Deudas pendientes</p>
          <p className="text-danger font-semibold">${formatMoney(data.pending_debts)}</p>
        </div>
      </div>

      {insight && (
        <div className={`p-3 rounded-lg ${config.bg} border ${config.border}`}>
          <div className="flex items-start gap-2">
            <Sparkles className={`w-4 h-4 ${config.color} mt-0.5 flex-shrink-0`} />
            <div>
              <p className="text-xs font-medium text-muted mb-1">Insights by Gemini</p>
              <p className="text-sm text-muted">{insight}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-line">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Días restantes del mes: {data.days_until_month_end}</span>
          <span className={data.prediction === 'positive' ? 'text-success' : 'text-danger'}>
            Predicción: {data.prediction === 'positive' ? 'Positiva' : 'Negativa'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SafeToSpendWidget;
