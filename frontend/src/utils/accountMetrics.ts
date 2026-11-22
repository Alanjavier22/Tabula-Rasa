import Decimal from 'decimal.js-light';
import type { Account, CreditCardStatement } from '../types';
import { clampZero, toDecimal } from './money';

export function isAccountActive(account: Pick<Account, 'is_active'>): boolean {
  return account.is_active !== false && Number(account.is_active) !== 0;
}

export function calculateLiquidBalance(accounts: Account[]): Decimal {
  return accounts
    .filter(
      (acc) =>
        isAccountActive(acc) &&
        (acc.account_type === 'checking' || acc.account_type === 'savings'),
    )
    .reduce((sum, acc) => sum.plus(toDecimal(acc.balance)), new Decimal(0));
}

export function getLatestStatementByAccount(
  statements: CreditCardStatement[],
): Map<string, CreditCardStatement> {
  const latestMap = new Map<string, CreditCardStatement>();
  for (const stmt of statements) {
    const current = latestMap.get(stmt.account_id);
    if (
      !current ||
      stmt.year > current.year ||
      (stmt.year === current.year && stmt.month > current.month)
    ) {
      latestMap.set(stmt.account_id, stmt);
    }
  }
  return latestMap;
}

export function calculateCreditCardDebt(
  accounts: Account[],
  statements: CreditCardStatement[],
): Decimal {
  const stmtByAccount = new Map<string, Decimal>();
  let orphanStmtDebt = new Decimal(0);

  for (const stmt of statements) {
    if (String(stmt.status).toLowerCase() === 'paid') continue;
    const baseDue = toDecimal(stmt.user_share ?? stmt.statement_balance);
    const unpaid = clampZero(baseDue.minus(toDecimal(stmt.amount_paid)));
    if (stmt.account_id) {
      stmtByAccount.set(
        stmt.account_id,
        (stmtByAccount.get(stmt.account_id) ?? new Decimal(0)).plus(unpaid),
      );
    } else {
      orphanStmtDebt = orphanStmtDebt.plus(unpaid);
    }
  }

  const activeCards = accounts.filter(
    (acc) => acc.account_type === 'credit_card' && isAccountActive(acc),
  );
  const activeCardIds = new Set(activeCards.map((acc) => acc.id));

  let totalDebt = orphanStmtDebt;
  for (const [accId, debt] of stmtByAccount.entries()) {
    if (!activeCardIds.has(accId)) {
      totalDebt = totalDebt.plus(debt);
    }
  }

  for (const acc of activeCards) {
    const rawBalance = toDecimal(acc.balance);
    const liveDebt = rawBalance.lt(0) ? rawBalance.abs() : new Decimal(0);
    const stmtDebt = stmtByAccount.get(acc.id) ?? new Decimal(0);
    totalDebt = totalDebt.plus(liveDebt.lt(stmtDebt) ? stmtDebt : liveDebt);
  }

  return totalDebt;
}
