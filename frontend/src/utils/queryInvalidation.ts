import type { QueryClient } from '@tanstack/react-query';

export const CORE_FINANCIAL_KEYS = [
  'safeToSpend',
  'dashboardSummary',
  'cashFlowForecast',
  'netWorth',
] as const;

export function invalidateFinancialQueries(
  queryClient: QueryClient,
  queryKeys: readonly string[],
): void {
  for (const key of queryKeys) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}
