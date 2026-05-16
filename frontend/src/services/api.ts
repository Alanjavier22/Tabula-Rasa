import axios from 'axios';
import { prepareForAI, hydrateAIResponse } from '../utils/privacy';
import { parseCSVAsync } from '../utils/csvParsers';
import { aiCashFlowService } from './AICashFlowService';

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

/**
 * Extract port from URL for port-aware token storage
 */
const getPortFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    return port;
  } catch {
    return '8001'; // Default fallback
  }
};

/**
 * Get port-specific token key (e.g., finance_token_8001)
 */
export const getTokenKey = (): string => {
  const baseUrl = localStorage.getItem('finance_base_url') || API_BASE_URL;
  const port = getPortFromUrl(baseUrl);
  return `finance_token_${port}`;
};

// FAIL-FAST: No auto-correction of environment. Misconfigured URLs will cause visible errors.

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 900000, // 15 minute timeout to accommodate extreme API throttling/retries
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dynamic Interceptor for Local-First Auth
api.interceptors.request.use(
  (config) => {
    const baseUrl = localStorage.getItem('finance_base_url');
    const tokenKey = getTokenKey();
    const token = localStorage.getItem(tokenKey);

    if (baseUrl) {
      // Clear old 8000 port from localStorage if present
      if (baseUrl.includes(':8000')) {
        localStorage.removeItem('finance_base_url');
      } else {
        config.baseURL = baseUrl;
      }
    }
    
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
      config.headers['X-Tabula-Auth'] = token; // Compatibility with industrial security middleware
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
    // 401: Invalid or expired token, 403: Forbidden (not paired or revoked)
    if (error.response?.status === 401 || error.response?.status === 403) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      console.warn(`[API] ${error.response.status} - auth failure`);
      
      // Clear auth (port-aware)
      const tokenKey = getTokenKey();
      localStorage.removeItem(tokenKey);
      
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
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/transactions/', { params }),
  getById: (id: string) => api.get(`/transactions/${id}`),
  create: (data: any) => api.post('/transactions/', data),
  update: (id: string, data: any) => api.put(`/transactions/${id}`, data),
  delete: (id: string) => api.delete(`/transactions/${id}`),
};

export const categoriesAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/categories/', { params }),
  getById: (id: string) => api.get(`/categories/${id}`),
  create: (data: any) => api.post('/categories/', data),
  update: (id: string, data: any) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
  export: () => api.get('/categories/export'),
  import: (categories: any[]) => api.post('/categories/import', categories),
};

export const accountsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/accounts/', { params }),
  getById: (id: string) => api.get(`/accounts/${id}`),
  create: (data: any) => api.post('/accounts/', data),
  update: (id: string, data: any) => api.put(`/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/accounts/${id}`),
};

export const budgetsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/budgets/', { params }),
  getById: (id: string) => api.get(`/budgets/${id}`),
  create: (data: any) => api.post('/budgets/', data),
  update: (id: string, data: any) => api.put(`/budgets/${id}`, data),
  delete: (id: string) => api.delete(`/budgets/${id}`),
};

export const goalsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/goals/', { params }),
  getById: (id: string) => api.get(`/goals/${id}`),
  create: (data: any) => api.post('/goals/', data),
  update: (id: string, data: any) => api.put(`/goals/${id}`, data),
  delete: (id: string) => api.delete(`/goals/${id}`),
};

export const remindersAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/reminders/', { params }),
  getById: (id: string) => api.get(`/reminders/${id}`),
  create: (data: any) => api.post('/reminders/', data),
  update: (id: string, data: any) => api.put(`/reminders/${id}`, data),
  delete: (id: string) => api.delete(`/reminders/${id}`),
};

export const subscriptionsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/subscriptions/', { params }),
  getById: (id: string) => api.get(`/subscriptions/${id}`),
  create: (data: any) => api.post('/subscriptions/', data),
  update: (id: string, data: any) => api.put(`/subscriptions/${id}`, data),
  delete: (id: string) => api.delete(`/subscriptions/${id}`),
  pay: (id: string) => api.post(`/subscriptions/${id}/pay`),
};

export const statementsAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/statements/', { params }),
  getById: (id: string) => api.get(`/statements/${id}`),
  create: (data: any) => api.post('/statements/', data),
  update: (id: string, data: any) => api.put(`/statements/${id}`, data),
  delete: (id: string) => api.delete(`/statements/${id}`),
  // Debt shares endpoints
  addDebtShare: (statementId: string, data: any) => api.post(`/statements/${statementId}/shares`, data),
  updateDebtShare: (shareId: string, data: any) => api.put(`/statements/shares/${shareId}`, data),
  deleteDebtShare: (shareId: string) => api.delete(`/statements/shares/${shareId}`),
};

export const iousAPI = {
  getAll: (params?: { limit?: number; offset?: number }) => api.get('/ious/', { params }),
  getPending: () => api.get('/ious/pending'),
  getById: (id: string) => api.get(`/ious/${id}`),
  create: (data: any) => api.post('/ious/', data),
  update: (id: string, data: any) => api.put(`/ious/${id}`, data),
  settle: (id: string, data: { account_id?: string }) => api.post(`/ious/${id}/settle`, data),
  delete: (id: string) => api.delete(`/ious/${id}`),
};

export const deferredAPI = {
  getAll: () => api.get('/deferred/'),
  create: (data: any) => api.post('/deferred/', data),
  advance: (id: string) => api.post(`/deferred/${id}/advance`),
  delete: (id: string) => api.delete(`/deferred/${id}`),
};

// --- ONLINE REQUIRED APIS (AXIOS) ---

export const metricsAPI = {
  getSafeToSpend: () => api.get('/metrics/safe-to-spend'),
  getNetWorth: () => api.get('/metrics/net-worth'),
  getVehicleTelemetry: () => api.get('/metrics/vehicle-telemetry'),
  getCashFlowForecast: (days?: number) => api.get('/metrics/cash-flow-forecast', { params: days ? { days } : undefined }),
  getCashFlowProjectionDays: (days: number) => api.get(`/metrics/cash-flow-projection/${days}`),
  getDashboardSummary: () => api.get('/metrics/dashboard-summary'),
  getInsights: () => api.get('/ai/insights'),
};

export const alertsAPI = {
  getPaymentReminders: (daysAhead?: number) => api.get('/alerts/payment-reminders', { params: daysAhead ? { days_ahead: daysAhead } : undefined }),
};

export const backupAPI = {
  createManualBackup: () => api.post('/backup/manual'),
  listBackups: () => api.get('/backup/list'),
  restoreBackup: (backupId: string) => api.post(`/backup/restore/${backupId}`, { confirmed: true, create_pre_restore_backup: true }),
};

export const fiscalAPI = {
  getReport: (startDate: string, endDate: string, categoryIds?: string) => 
    api.get('/fiscal/report', { params: { start_date: startDate, end_date: endDate, category_ids: categoryIds } }),
  getTrend: (startDate: string, endDate: string, categoryIds?: string) => 
    api.get('/fiscal/trend', { params: { start_date: startDate, end_date: endDate, category_ids: categoryIds } }),
  exportDeclaracionSRI: (year: number, format: 'xml' | 'json') => 
    api.get('/fiscal/export-declaracion-sri', { 
      params: { year, format },
      responseType: 'blob' 
    }),
};

export const aiAPI = {
  audioToTransactions: (audioData: { audio_base64: string; audio_format?: string }) => 
    api.post('/api/ai/audio-to-txns', audioData),
  parseReceipt: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/ai/parse-receipt', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  batchCategoryMapping: (descriptions: { descriptions: string[] }) => {
    const { sanitized } = prepareForAI(descriptions);
    return api.post('/api/ai/batch-category-mapping', { descriptions: sanitized });
  },
  suggestCategories: (data: { transactions: any[]; categories: any[] }) => 
    api.post('/api/ai/suggest-categories', data),
  getInsights: () => api.get('/ai/insights'),
  testComponent: (component: string) => api.get(`/api/ai/test-component?component=${component}`),
};

export const aiGoalsAPI = {
  getSmartRecommendations: () => api.get('/ai/goals/smart-recommendations'),
};

export const intelligenceAPI = {
  uploadStatement: (accountId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/intelligence/import-statement/${accountId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  confirmImport: (logId: string, transactions: any[], statementMetadata?: any) => 
    api.post(`/intelligence/confirm-import/${logId}`, {
      confirmed_transactions: transactions,
      statement_metadata: statementMetadata
    }),
  uploadAccountDocument: (accountId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/intelligence/parse-account/${accountId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  confirmAccountImport: (logId: string, transactions: any[]) => 
    api.post(`/intelligence/confirm-account-import/${logId}`, {
      confirmed_transactions: transactions
    }),
};

export const snapshotsAPI = {
  create: (data: { month: number; year: number; lock?: boolean }) => api.post('/snapshots/create', data),
  getAll: (params?: any) => api.get('/snapshots/', { params }),
  getById: (id: string) => api.get(`/snapshots/${id}`),
  getByMonthYear: (month: number, year: number) => api.get(`/snapshots/month/${month}/year/${year}`),
  delete: (id: string) => api.delete(`/snapshots/${id}`),
  analyze: (id: string) => api.post(`/snapshots/${id}/analyze`),
  reconcile: () => api.post('/snapshots/reconcile'), // FASE 6: Manual reconciliation endpoint
};

export const aiAssistantAPI = {
  chat: async (
    message: string, 
    includeCashFlow: boolean = false, 
    includeAssets: boolean = false,
    documentBase64?: string,
    documentMimeType?: string
  ) => {
    // Sanitize message with hydration map
    const { sanitized: sanitizedMessage, hydrationMap: messageMap } = prepareForAI(message);

    // Get CashFlow context if requested
    let cashFlowContext = null;
    if (includeCashFlow) {
      const context = await aiCashFlowService.getAIContext();
      cashFlowContext = {
        current_balance_cents: context.current_balance_cents,
        safe_to_spend_30d: context.safe_to_spend_30d,
        safe_to_spend_60d: context.safe_to_spend_60d,
        safe_to_spend_90d: context.safe_to_spend_90d,
        projected_income_30d: context.projected_income_30d,
        projected_expenses_30d: context.projected_expenses_30d,
        seasonal_adjustment_30d: context.seasonal_adjustment_30d,
        subscriptions_due_30d: context.subscriptions_due_30d,
        ious_pending_30d: context.ious_pending_30d,
      };
    }

    // Get Assets context if requested
    let assetsContext = null;
    if (includeAssets) {
      const context = await aiCashFlowService.getAIContext();
      assetsContext = {
        assets_total_value_cents: context.assets_total_value_cents,
        assets_details: context.assets_details,
      };
    }

    const response = await api.post('/ai-assistant/chat', {
      message: sanitizedMessage,
      cash_flow_context: cashFlowContext,
      assets_context: assetsContext,
      document_base64: documentBase64,
      document_mime_type: documentMimeType,
    });

    // Hydrate response with original values
    const hydratedResponse = hydrateAIResponse(response.data.response, messageMap);

    return {
      ...response.data,
      response: hydratedResponse,
    };
  },
};

export const importAPI = {
  uploadCSV: async (file: File, accountId: string, onProgress?: (progress: number) => void) => {
    // Read CSV locally
    const text = await file.text();
    
    // Parse using async chunked parser (prevents RAM overflow with 50k+ records)
    // Deduplication now happens inside parseCSVAsync via backend check
    const parsedTransactions = await parseCSVAsync(text, accountId, onProgress);
    
    if (parsedTransactions.length === 0) {
      return { data: { imported: 0, message: 'No valid transactions found' } };
    }

    // Send to backend for processing
    const response = await api.post('/transactions/import-batch', {
      transactions: parsedTransactions,
      skip_duplicates: true,
    });

    return response.data;
  },
  uploadGuayaquilExcel: async (file: File, accountId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (accountId) formData.append('account_id', accountId);
    
    const response = await api.post('/transactions/import-guayaquil', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response;
  },
};

export const configAPI = {
  getAll: (params?: any) => api.get('/config', { params }),
  getByKey: (key: string) => api.get(`/config/${key}`),
  create: (data: any) => api.post('/config', data),
  update: (key: string, data: any) => api.put(`/config/${key}`, data),
  delete: (key: string) => api.delete(`/config/${key}`),
  wipeDatabase: () => api.post('/config/wipe-database'),
};

export const driveConfigAPI = {
  getStatus: () => api.get('/config/drive/status'),
  setCredentials: (data: any) => api.post('/config/drive', data),
  getAuthUrl: () => api.get('/backup/google/auth-url'),
  test: () => api.post('/config/drive/test'),
};

export const authAPI = {
  generatePairingCode: () => api.post('/auth/pair/generate'),
  consumePairingCode: (pin: string, deviceName: string) => api.post('/auth/pair/consume', { pin, device_name: deviceName }),
  getPairingStatus: (pin: string) => api.get(`/auth/pair/status?pin=${pin}`),
  pairLocalhost: () => axios.post('http://127.0.0.1:8001/auth/pair/localhost'),
  listDevices: () => api.get('/auth/devices'),
  revokeDevice: (id: string) => api.delete(`/auth/devices/${id}`),
};

export const maintenanceAPI = {
  healBalances: () => api.post('/maintenance/heal-balances'),
};



export default api;
