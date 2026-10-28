import type { Transaction } from "../types";

export function filterTransactions(
  transactions: Transaction[],
  query: string,
  startDate: string,
  endDate: string,
  categoryId = "",
  accountId = "",
) {
  const term = query.trim().toLocaleLowerCase();
  return transactions.filter((transaction) => {
    const day = transaction.date.slice(0, 10);
    return (
      (!term ||
        `${transaction.description ?? ""} ${transaction.beneficiary ?? ""}`
          .toLocaleLowerCase()
          .includes(term)) &&
      (!startDate || day >= startDate) &&
      (!endDate || day <= endDate) &&
      (!categoryId || transaction.category_id === categoryId) &&
      (!accountId || transaction.account_id === accountId)
    );
  });
}
