/**
 * FASE 8.1: Conflict Resolution Utilities
 * Helper functions for handling sync conflicts without triggering sync_queue
 */

import { db } from '../db/db';

/**
 * Silent update - Update local data without triggering sync_queue
 * Used when applying server data locally after conflict resolution (Server Wins)
 * Prevents infinite sync loop
 */
export const silentUpdate = async (tableName: string, recordId: string, data: any): Promise<void> => {
  try {
    // @ts-ignore
    await db.table(tableName).update(recordId, data);
    console.log(`[silentUpdate] Updated ${tableName}:${recordId} without triggering sync_queue`);
  } catch (error) {
    console.error(`[silentUpdate] Failed to update ${tableName}:${recordId}:`, error);
    throw error;
  }
};

/**
 * Check if record has unresolved conflict
 * Returns true if record is in sync_conflicts table with resolved=false
 */
export const hasConflict = async (tableName: string, recordId: string): Promise<boolean> => {
  try {
    // @ts-ignore
    const conflicts = await db.sync_conflicts
      .where('table_name')
      .equals(tableName)
      .and(c => c.record_id === recordId && c.resolved === false)
      .toArray();
    return conflicts.length > 0;
  } catch (error) {
    console.error(`[hasConflict] Failed to check conflict for ${tableName}:${recordId}:`, error);
    return false;
  }
};

/**
 * Get conflict details for a specific record
 * Returns the conflict entry if exists, null otherwise
 */
export const getConflict = async (tableName: string, recordId: string) => {
  try {
    // @ts-ignore
    const conflicts = await db.sync_conflicts
      .where('table_name')
      .equals(tableName)
      .and(c => c.record_id === recordId && c.resolved === false)
      .toArray();
    return conflicts.length > 0 ? conflicts[0] : null;
  } catch (error) {
    console.error(`[getConflict] Failed to get conflict for ${tableName}:${recordId}:`, error);
    return null;
  }
};

/**
 * Resolve a conflict by marking it as resolved
 * Used after human intervention
 */
export const resolveConflict = async (conflictId: string): Promise<void> => {
  try {
    // @ts-ignore
    await db.sync_conflicts.update(conflictId, {
      resolved: true,
      resolved_at: new Date().toISOString(),
    });
    console.log(`[resolveConflict] Marked conflict ${conflictId} as resolved`);
  } catch (error) {
    console.error(`[resolveConflict] Failed to resolve conflict ${conflictId}:`, error);
    throw error;
  }
};
