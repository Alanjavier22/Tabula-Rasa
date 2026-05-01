import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:8001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface HandshakeGenerateResponse {
  token: string;
  pin: string;
  expires_in_seconds: number;
}

interface HandshakeValidateResponse {
  api_key_local: string;
  device_id: string;
}

/**
 * Handshake Service for PC-Mobile pairing
 * PC generates PIN, mobile validates it
 */
export const handshakeService = {
  /**
   * Generate handshake session (PC side)
   * Returns token + PIN for mobile to validate
   */
  generate: async (): Promise<HandshakeGenerateResponse> => {
    const response = await api.post('/handshake/generate');
    return response.data;
  },

  /**
   * Validate PIN and receive API key (Mobile side)
   * Mobile sends PIN to get persistent api_key_local
   */
  validate: async (pin: string, deviceName: string): Promise<HandshakeValidateResponse> => {
    const response = await api.post('/handshake/validate', {
      pin,
      device_name: deviceName,
    });
    return response.data;
  },

  /**
   * Save trusted device ID to PC's Dexie config (atomic transaction)
   * PC calls this after mobile successfully pairs
   */
  saveTrustedDevice: async (deviceId: string): Promise<void> => {
    await db.transaction('rw', ['config'], async () => {
      // Get existing trusted_device_ids
      const existing = await db.config
        .where('key')
        .equals('trusted_device_ids')
        .first();

      let trustedIds: string[] = [];
      if (existing && existing.value) {
        try {
          trustedIds = JSON.parse(existing.value);
        } catch (e) {
          console.error('[Handshake] Failed to parse trusted_device_ids:', e);
          trustedIds = [];
        }
      }

      // Add new device ID if not already present
      if (!trustedIds.includes(deviceId)) {
        trustedIds.push(deviceId);
      }

      // Save back to config
      const now = new Date().toISOString();
      if (existing) {
        await db.config.update(existing.id, {
          value: JSON.stringify(trustedIds),
          updated_at: now,
        });
      } else {
        await db.config.add({
          id: uuidv4(),
          key: 'trusted_device_ids',
          value: JSON.stringify(trustedIds),
          is_deleted: false,
          updated_at: now,
        });
      }
    });
  },

  /**
   * Get all trusted device IDs from PC's Dexie config
   */
  getTrustedDevices: async (): Promise<string[]> => {
    const existing = await db.config
      .where('key')
      .equals('trusted_device_ids')
      .first();

    if (!existing || !existing.value) return [];

    try {
      return JSON.parse(existing.value);
    } catch (e) {
      console.error('[Handshake] Failed to parse trusted_device_ids:', e);
      return [];
    }
  },

  /**
   * Remove device from trusted list
   */
  removeTrustedDevice: async (deviceId: string): Promise<void> => {
    await db.transaction('rw', ['config'], async () => {
      const existing = await db.config
        .where('key')
        .equals('trusted_device_ids')
        .first();

      if (!existing || !existing.value) return;

      let trustedIds: string[] = JSON.parse(existing.value);
      trustedIds = trustedIds.filter((id: string) => id !== deviceId);

      const now = new Date().toISOString();
      await db.config.update(existing.id, {
        value: JSON.stringify(trustedIds),
        updated_at: now,
      });
    });
  },
};
