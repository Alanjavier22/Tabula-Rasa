import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import type { Account, CreditCardStatement } from '../types';
import { useMemo } from 'react';

interface IntegrityStatusProps {
  accounts: Account[];
  statements: CreditCardStatement[];
  isLoading?: boolean;
}

export const IntegrityStatus = ({ accounts, statements, isLoading }: IntegrityStatusProps) => {
  const healthStatus = useMemo(() => {
    if (isLoading) return { status: 'loading', message: 'Verificando...' };

    const ccAccounts = accounts.filter(a => a.account_type === 'credit_card');
    if (ccAccounts.length === 0) {
      return { status: 'neutral', message: 'No hay tarjetas que conciliar' };
    }

    let discrepancies = 0;
    let checkedAccounts = 0;

    ccAccounts.forEach(acc => {
      const latestStmt = statements
        .filter(s => s.account_id === acc.id)
        .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))[0];

      if (latestStmt) {
        checkedAccounts++;
        const diff = Math.abs(acc.balance + latestStmt.statement_balance);
        if (diff > 10) discrepancies++;
      }
    });

    if (discrepancies > 0) {
      return {
        status: 'warning',
        message: `${discrepancies} ${discrepancies === 1 ? 'tarjeta requiere' : 'tarjetas requieren'} revisión`
      };
    }

    if (checkedAccounts < ccAccounts.length) {
      return {
        status: 'unknown',
        message: checkedAccounts === 0
          ? 'Aún no hay estados de cuenta para conciliar'
          : `Conciliación parcial: ${checkedAccounts} de ${ccAccounts.length} tarjetas`
      };
    }

    return {
      status: 'healthy',
      message: 'Tarjetas conciliadas sin diferencias relevantes'
    };
  }, [accounts, statements, isLoading]);

  const Icon = healthStatus.status === 'loading'
    ? Loader2
    : healthStatus.status === 'warning'
      ? ShieldAlert
      : ShieldCheck;
  const tone = healthStatus.status === 'warning'
    ? 'text-warning'
    : healthStatus.status === 'healthy'
      ? 'text-success'
      : 'text-muted';

  return (
    <p className={`integrity-note ${tone}`} role="status" aria-live="polite" aria-atomic="true">
      <Icon aria-hidden="true" className={healthStatus.status === 'loading' ? 'animate-spin' : ''} />
      {healthStatus.message}
    </p>
  );
};
