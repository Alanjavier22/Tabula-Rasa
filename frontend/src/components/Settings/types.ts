export interface ConfigData {
  vehicle_categories: string[];
  safe_to_spend_buffer: number;
  gemini_api_key: string;
  ai_persona: string;
}

export interface GoogleDriveCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

export interface GoogleDriveStatus {
  is_configured: boolean;
  has_client_id: boolean;
  has_client_secret: boolean;
  has_refresh_token: boolean;
}

export type ToastMessage = { message: string; type: 'success' | 'error' | 'warning' };
