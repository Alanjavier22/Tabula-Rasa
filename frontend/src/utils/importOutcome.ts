import { isAxiosError } from 'axios';

export interface ImportOutcome { success: boolean; message: string }

export function importFailure(error: unknown, fallback: string): ImportOutcome {
  const detail = isAxiosError<{ detail?: unknown }>(error) ? error.response?.data?.detail : undefined;
  return { success: false, message: typeof detail === 'string' && detail.trim() ? detail : fallback };
}

export function markNonDuplicateSelected<T extends { is_duplicate?: boolean }>(
  transactions: T[],
): Array<T & { selected: boolean }> {
  return transactions.map((tx) => ({
    ...tx,
    selected: !tx.is_duplicate,
  }));
}

export function getSelectedTransactionsOrOutcome<T extends { selected: boolean }>(
  transactions: T[],
  emptyMessage = 'Selecciona al menos una transacción para importar.',
): { selected: T[]; error: ImportOutcome | null } {
  const selected = transactions.filter((t) => t.selected);
  if (selected.length === 0) {
    return { selected, error: { success: false, message: emptyMessage } };
  }
  return { selected, error: null };
}
