import { isAxiosError } from 'axios';

export interface ImportOutcome { success: boolean; message: string }

export function importFailure(error: unknown, fallback: string): ImportOutcome {
  const detail = isAxiosError<{ detail?: unknown }>(error) ? error.response?.data?.detail : undefined;
  return { success: false, message: typeof detail === 'string' && detail.trim() ? detail : fallback };
}
