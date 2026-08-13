import axios from 'axios';
import { prepareForAI } from '../utils/privacy';
import { parseCSVAsync } from '../utils/csvParsers';
import type {
  Transaction,
  Category,
  Account,
  Budget,
  Goal,
  Reminder,
  Subscription,
  CreditCardStatement,
  IOU,
  DeferredPayment,
  SafeToSpendResponse,
  NetWorthResponse,
  VehicleTelemetryResponse,
  CashFlowForecastResponse,
  DashboardSummaryResponse,
  DebtShare,
  AlertsResponse,
  NetWorthSnapshot
} from '../types/index';

const getDynamicBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  const hostname = window.location.hostname;
  // If we are on an IP address (not localhost), assume the API is on the same host at port 8001
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return `http://${hostname}:8001`;
  }
  
  return 'http://localhost:8001';
};

const API_BASE_URL = getDynamicBaseUrl();

// 60-second default timeout to fail fast on simple network requests
// withCredentials: la sesión viaja en una cookie httpOnly, no en localStorage.
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dynamic Interceptor - reencamina cada request a la baseURL vinculada por el
// usuario (relevante para el escenario multi-dispositivo, donde el móvil
// vincula contra la IP LAN del host en vez de localhost).
api.interceptors.request.use(
  (config) => {
    const baseUrl = localStorage.getItem('finance_base_url');

    if (baseUrl) {
      // Clear old 8000 port from localStorage if present
      if (baseUrl.includes(':8000')) {
        localStorage.removeItem('finance_base_url');
      } else {
        config.baseURL = baseUrl;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 401 Interceptor - Auto-logout on auth failure
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // /auth/me y /auth/pair/* fallan con 401/403 como resultado ESPERADO
    // (todavía no hay sesión, o se está reintentando el pairing) - AuthGuard
    // ya maneja esos casos por su cuenta. Si el interceptor también los
    // tratara como "sesión inválida", el primer chequeo de /auth/me en un
    // dispositivo sin parear todavía dispara un window.location.href antes
    // de que el pairing automático llegue a correr, y cada reload vuelve a
    // fallar el mismo chequeo -> loop infinito de recargas.
    const url: string = error.config?.url || '';
    const isAuthCheckEndpoint = url.includes('/auth/me') || url.includes('/auth/pair/');

    // 401: Invalid or expired token, 403: Forbidden (not paired or revoked)
    if (!isAuthCheckEndpoint && (error.response?.status === 401 || error.response?.status === 403)) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      console.warn(`[API] ${error.response.status} - auth failure`);

      // Best-effort: sólo el backend puede borrar la cookie httpOnly.
      api.post('/auth/logout').catch(() => {});

      // Only redirect if not on localhost AND not already on /pair
      if (!isLocalhost && window.location.pathname !== '/pair') {
        window.location.href = '/pair';
      } else if (isLocalhost && error.response?.status === 401) {
        // Localhost only auto-logs out on 401 (expired), not 403 (bypass usually works)
        window.location.href = '/?msg=Sesión reiniciada';
      }
    }
    return Promise.reject(error);
  }
);

// --- CORE FINANCIAL APIS (THIN CLIENT - HTTP ONLY) ---

export const transactionsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<Transaction[]>('/transactions/', { params }),
  getById: (id: string) => api.get<Transaction>(`/transactions/${id}`),
  create: (data: Partial<Transaction>) => api.post<Transaction>('/transactions/', data),
  update: (id: string, data: Partial<Transaction>) => api.put<Transaction>(`/transactions/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/transactions/${id}`),
};

export const categoriesAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<Category[]>('/categories/', { params }),
  getById: (id: string) => api.get<Category>(`/categories/${id}`),
  create: (data: Partial<Category>) => api.post<Category>('/categories/', data),
  update: (id: string, data: Partial<Category>) => api.put<Category>(`/categories/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/categories/${id}`),
  export: () => api.get<any[]>('/categories/export'),
  import: (categories: Partial<Category>[]) => api.post<{ message: string; imported_count: number; skipped_count: number; errors: string[] }>('/categories/import', categories),
};

export const accountsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<Account[]>('/accounts/', { params }),
  getById: (id: string) => api.get<Account>(`/accounts/${id}`),
  create: (data: Partial<Account>) => api.post<Account>('/accounts/', data),
  update: (id: string, data: Partial<Account>) => api.put<Account>(`/accounts/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/accounts/${id}`),
};

export const budgetsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<Budget[]>('/budgets/', { params }),
  getById: (id: string) => api.get<Budget>(`/budgets/${id}`),
  create: (data: Partial<Budget>) => api.post<Budget>('/budgets/', data),
  update: (id: string, data: Partial<Budget>) => api.put<Budget>(`/budgets/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/budgets/${id}`),
  generateRecurring: (data: { month: number; year: number; delete_previous: boolean }) => api.post<Budget[]>('/budgets/generate-recurring', data),
};

export const goalsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<Goal[]>('/goals/', { params }),
  getById: (id: string) => api.get<Goal>(`/goals/${id}`),
  create: (data: Partial<Goal>) => api.post<Goal>('/goals/', data),
  update: (id: string, data: Partial<Goal>) => api.put<Goal>(`/goals/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/goals/${id}`),
};

export const remindersAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<Reminder[]>('/reminders/', { params }),
  getById: (id: string) => api.get<Reminder>(`/reminders/${id}`),
  create: (data: Partial<Reminder>) => api.post<Reminder>('/reminders/', data),
  update: (id: string, data: Partial<Reminder>) => api.put<Reminder>(`/reminders/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/reminders/${id}`),
};

export const subscriptionsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<Subscription[]>('/subscriptions/', { params }),
  getById: (id: string) => api.get<Subscription>(`/subscriptions/${id}`),
  create: (data: Partial<Subscription>) => api.post<Subscription>('/subscriptions/', data),
  update: (id: string, data: Partial<Subscription>) => api.put<Subscription>(`/subscriptions/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/subscriptions/${id}`),
  pay: (id: string) => api.post<{ message: string; transaction_id: string; next_billing_date: string }>(`/subscriptions/${id}/pay`),
};

export const statementsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<CreditCardStatement[]>('/statements/', { params }),
  getById: (id: string) => api.get<CreditCardStatement>(`/statements/${id}`),
  create: (data: Partial<CreditCardStatement>) => api.post<CreditCardStatement>('/statements/', data),
  update: (id: string, data: Partial<CreditCardStatement>) => api.put<CreditCardStatement>(`/statements/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/statements/${id}`),
  addDebtShare: (statementId: string, data: Partial<DebtShare>) => api.post<DebtShare>(`/statements/${statementId}/shares`, data),
  updateDebtShare: (shareId: string, data: Partial<DebtShare>) => api.put<DebtShare>(`/statements/shares/${shareId}`, data),
  deleteDebtShare: (shareId: string) => api.delete<{ message: string }>(`/statements/shares/${shareId}`),
};

export const iousAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get<IOU[]>('/ious/', { params }),
  getPending: () => api.get<IOU[]>('/ious/pending'),
  getById: (id: string) => api.get<IOU>(`/ious/${id}`),
  create: (data: Partial<IOU>) => api.post<IOU>('/ious/', data),
  update: (id: string, data: Partial<IOU>) => api.put<IOU>(`/ious/${id}`, data),
  settle: (id: string, data: { account_id?: string }) => api.post<{ message: string; transaction_id: string }>(`/ious/${id}/settle`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/ious/${id}`),
};

export const deferredAPI = {
  getAll: () => api.get<DeferredPayment[]>('/deferred/'),
  create: (data: Partial<DeferredPayment>) => api.post<DeferredPayment>('/deferred/', data),
  advance: (id: string) => api.post<DeferredPayment>(`/deferred/${id}/advance`),
  delete: (id: string) => api.delete<{ message: string }>(`/deferred/${id}`),
};

// --- ONLINE REQUIRED APIS (AXIOS) ---

export const metricsAPI = {
  getSafeToSpend: () => api.get<SafeToSpendResponse>('/metrics/safe-to-spend'),
  getNetWorth: () => api.get<NetWorthResponse>('/metrics/net-worth'),
  getVehicleTelemetry: () => api.get<VehicleTelemetryResponse>('/metrics/vehicle-telemetry'),
  getCashFlowForecast: (days?: number) => api.get<CashFlowForecastResponse>('/metrics/cash-flow-forecast', { params: days ? { days } : undefined }),
  getCashFlowProjectionDays: (days: number) => api.get<any>(`/metrics/cash-flow-projection/${days}`),
  getDashboardSummary: () => api.get<DashboardSummaryResponse>('/metrics/dashboard-summary'),
  getInsights: () => api.get<any>('/ai/insights'),
};

export const alertsAPI = {
  getPaymentReminders: (daysAhead?: number) => api.get<AlertsResponse>('/alerts/payment-reminders', { params: daysAhead ? { days_ahead: daysAhead } : undefined }),
};

export const backupAPI = {
  createManualBackup: () => api.post<{ success: boolean; message: string }>('/backup/manual'),
  listBackups: () => api.get<any>('/backup/list'),
  restoreBackup: (backupId: string) => api.post<{ success: boolean; message: string }>(`/backup/restore/${backupId}`, { confirmed: true, create_pre_restore_backup: true }),
};

export const fiscalAPI = {
  getReport: (startDate: string, endDate: string, categoryIds?: string) => 
    api.get<any>('/fiscal/report', { params: { start_date: startDate, end_date: endDate, category_ids: categoryIds } }),
  getTrend: (startDate: string, endDate: string, categoryIds?: string) => 
    api.get<any>('/fiscal/trend', { params: { start_date: startDate, end_date: endDate, category_ids: categoryIds } }),
  exportDeclaracionSRI: (year: number, format: 'xml' | 'json') => 
    api.get<Blob>('/fiscal/export-declaracion-sri', { 
      params: { year, format },
      responseType: 'blob' 
    }),
};

export const aiAPI = {
  // Heavy request: uses 15 min timeout (900000ms)
  audioToTransactions: (audioData: { audio_base64: string; audio_format?: string }) => 
    api.post<any>('/api/ai/audio-to-txns', audioData, { timeout: 900000 }),
  // Heavy request: uses 15 min timeout (900000ms)
  parseReceipt: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<any>('/api/ai/parse-receipt', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 900000,
    });
  },
  batchCategoryMapping: (descriptions: { descriptions: string[] }) => {
    const { sanitized } = prepareForAI(descriptions);
    return api.post<{ mapping: Record<string, string> }>('/api/ai/batch-category-mapping', { descriptions: sanitized });
  },
  suggestCategories: (data: { transactions: Transaction[]; categories: Category[] }) => 
    api.post<any>('/api/ai/suggest-categories', data),
  getInsights: () => api.get<any>('/ai/insights'),
  testComponent: (component: string) => api.get<any>(`/api/ai/test-component?component=${component}`),
};

export const aiGoalsAPI = {
  getSmartRecommendations: () => api.get<any>('/ai/goals/smart-recommendations'),
};

export const intelligenceAPI = {
  // Heavy request: uses 15 min timeout (900000ms)
  uploadStatement: (accountId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<any>(`/intelligence/import-statement/${accountId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 900000,
    });
  },
  confirmImport: (logId: string, transactions: any[], statementMetadata?: any) => 
    api.post<any>(`/intelligence/confirm-import/${logId}`, {
      confirmed_transactions: transactions,
      statement_metadata: statementMetadata
    }),
  // Heavy request: uses 15 min timeout (900000ms)
  uploadAccountDocument: (accountId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<any>(`/intelligence/parse-account/${accountId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 900000,
    });
  },
  confirmAccountImport: (logId: string, transactions: any[]) => 
    api.post<any>(`/intelligence/confirm-account-import/${logId}`, {
      confirmed_transactions: transactions
    }),
};

export const snapshotsAPI = {
  create: (data: { month: number; year: number; lock?: boolean }) => api.post<NetWorthSnapshot>('/snapshots/create', data),
  getAll: (params?: any) => api.get<NetWorthSnapshot[]>('/snapshots/', { params }),
  getById: (id: string) => api.get<NetWorthSnapshot>(`/snapshots/${id}`),
  getByMonthYear: (month: number, year: number) => api.get<NetWorthSnapshot>(`/snapshots/month/${month}/year/${year}`),
  delete: (id: string) => api.delete<{ message: string }>(`/snapshots/${id}`),
  analyze: (id: string) => api.post<any>(`/snapshots/${id}/analyze`),
  reconcile: () => api.post<any>('/snapshots/reconcile'), // FASE 6: Manual reconciliation endpoint
};

export const importAPI = {
  // Heavy request: uses 15 min timeout (900000ms)
  uploadCSV: async (file: File, accountId: string, onProgress?: (progress: number) => void) => {
    // Read CSV locally
    const text = await file.text();
    
    // Parse using async chunked parser (prevents RAM overflow with 50k+ records)
    // Deduplication now happens inside parseCSVAsync via backend check
    const parsedTransactions = await parseCSVAsync(text, accountId, onProgress);
    
    if (parsedTransactions.length === 0) {
      return { imported: 0, message: 'No valid transactions found' };
    }

    // Send to backend for processing
    const response = await api.post<any>('/transactions/import-batch', {
      transactions: parsedTransactions,
      skip_duplicates: true,
    }, { timeout: 900000 });

    return response.data;
  },
  // Heavy request: uses 15 min timeout (900000ms)
  uploadGuayaquilExcel: async (file: File, accountId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (accountId) formData.append('account_id', accountId);
    
    const response = await api.post<any>('/transactions/import-guayaquil', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 900000,
    });
    return response;
  },
};

export const configAPI = {
  getAll: (params?: any) => api.get<any[]>('/config', { params }),
  getByKey: (key: string) => api.get<any>(`/config/${key}`),
  create: (data: any) => api.post<any>('/config', data),
  update: (key: string, data: any) => api.put<any>(`/config/${key}`, data),
  delete: (key: string) => api.delete<{ message: string }>(`/config/${key}`),
  wipeDatabase: () => api.post<{ message: string }>('/config/wipe-database'),
};

export const driveConfigAPI = {
  getStatus: () => api.get<{ is_configured: boolean; has_client_id: boolean; has_client_secret: boolean; has_refresh_token: boolean }>('/config/drive/status'),
  setCredentials: (data: any) => api.post<{ message: string }>('/config/drive', data),
  getAuthUrl: () => api.get<{ auth_url: string }>('/backup/google/auth-url'),
  test: () => api.post<{ success: boolean; message: string }>('/config/drive/test'),
};

export const authAPI = {
  generatePairingCode: () => api.post<{ pin: string; expires_in_seconds: number; qr_url: string }>('/auth/pair/generate'),
  consumePairingCode: (pin: string, deviceName: string) => api.post<{ paired: boolean; device_name: string }>('/auth/pair/consume', { pin, device_name: deviceName }),
  getPairingStatus: (pin: string) => api.get<{ status: string; token?: string; device_name?: string }>(`/auth/pair/status?pin=${pin}`),
  // Usa el mismo hostname que la página (no 127.0.0.1 fijo): si la página se
  // sirve desde "localhost", la cookie que setea el backend queda con Domain
  // localhost, y hay que seguir pegándole a localhost en los requests
  // siguientes - si no, son orígenes distintos para SameSite=Lax y el
  // navegador nunca manda la cookie de vuelta.
  pairLocalhost: () => axios.post<{ paired: boolean; device_name: string }>(`http://${window.location.hostname}:8001/auth/pair/localhost`, {}, { withCredentials: true }),
  me: () => api.get<{ device_id: string; device_name: string }>('/auth/me'),
  logout: () => api.post<{ message: string }>('/auth/logout'),
  listDevices: () => api.get<any[]>('/auth/devices'),
  revokeDevice: (id: string) => api.delete<{ message: string }>(`/auth/devices/${id}`),
};


export const maintenanceAPI = {
  healBalances: () => api.post<{ message: string }>('/maintenance/heal-balances'),
};

export default api;
