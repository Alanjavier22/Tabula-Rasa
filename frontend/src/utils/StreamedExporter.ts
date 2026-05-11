/**
 * Streamed Exporter - Thin Client Network Proxy
 * Delegates CSV generation to backend API, handles Blob download in browser
 */

import api from '../services/api';

export class StreamedExporter {
  private readonly API_BASE = '/api/export';

  /**
   * Export transactions - delegates to backend
   */
  async exportTransactions(): Promise<Blob> {
    const response = await api.get(`${this.API_BASE}/transactions`, {
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Export accounts - delegates to backend
   */
  async exportAccounts(): Promise<Blob> {
    const response = await api.get(`${this.API_BASE}/accounts`, {
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Export assets - delegates to backend
   */
  async exportAssets(): Promise<Blob> {
    const response = await api.get(`${this.API_BASE}/assets`, {
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Export net worth snapshots - delegates to backend
   */
  async exportSnapshots(): Promise<Blob> {
    const response = await api.get(`${this.API_BASE}/snapshots`, {
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Export SRI Annex - delegates to backend
   */
  async exportSRIAnnex(year: number): Promise<Blob> {
    const response = await api.get('/fiscal/sri-annex', {
      params: { year },
      responseType: 'blob',
    });
    console.log('SRI Annex response status:', response.status);
    console.log('SRI Annex response type:', response.headers['content-type']);
    console.log('SRI Annex blob size:', response.data.size);
    return response.data;
  }

  /**
   * Download blob as file (browser utility)
   */
  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}

export const streamedExporter = new StreamedExporter();
