/**
 * Vehicle Telemetry Service
 * Handles vehicle cost calculations and sync triggers
 */

import { db } from '../db/db';
import { v5 as uuidv5 } from 'uuid';

export interface VehicleStats {
  total_cost_cents: number;
  distance_traveled_km: number;
  cost_per_km_cents: number;
  total_fuel_logs: number;
  total_maintenance_logs: number;
}

export class VehicleService {
  /**
   * Calculate vehicle statistics from logs
   * All calculations in cents, convert to decimal only for UI display
   */
  async calculateVehicleStats(vehicleId: string): Promise<VehicleStats> {
    // Get all fuel logs for vehicle
    const fuelLogs = await db.fuel_logs
      .where('vehicle_id')
      .equals(vehicleId)
      .and(log => !log.is_deleted)
      .toArray();

    // Get all maintenance logs for vehicle
    const maintenanceLogs = await db.maintenance_logs
      .where('vehicle_id')
      .equals(vehicleId)
      .and(log => !log.is_deleted)
      .toArray();

    // Sum all costs in cents
    const totalFuelCost = fuelLogs.reduce((sum, log) => sum + log.cost_cents, 0);
    const totalMaintenanceCost = maintenanceLogs.reduce((sum, log) => sum + log.cost_cents, 0);
    const totalCostCents = totalFuelCost + totalMaintenanceCost;

    // Calculate distance traveled (max odometer - min odometer)
    const allOdometerReadings = [
      ...fuelLogs.map(l => l.odometer_reading),
      ...maintenanceLogs.map(l => l.odometer_reading)
    ];
    
    let distanceTraveledKm = 0;
    if (allOdometerReadings.length > 0) {
      const maxOdometer = Math.max(...allOdometerReadings);
      const minOdometer = Math.min(...allOdometerReadings);
      distanceTraveledKm = maxOdometer - minOdometer;
    }

    // Calculate cost per km (cents)
    let costPerKmCents = 0;
    if (distanceTraveledKm > 0) {
      costPerKmCents = Math.round(totalCostCents / distanceTraveledKm);
    }

    return {
      total_cost_cents: totalCostCents,
      distance_traveled_km: distanceTraveledKm,
      cost_per_km_cents: costPerKmCents,
      total_fuel_logs: fuelLogs.length,
      total_maintenance_logs: maintenanceLogs.length
    };
  }

  /**
   * Add fuel log with atomic sync trigger
   * Creates sync queue entry for log AND vehicle odometer update
   */
  async addFuelLog(
    vehicleId: string,
    date: string,
    odometerReading: number,
    costCents: number,
    gallonsOrLiters: number
  ): Promise<string> {
    const logId = uuidv5(`fuel_${vehicleId}_${Date.now()}`, uuidv5.URL);
    const now = new Date().toISOString();

    // Atomic transaction: add log, update vehicle odometer, create sync queue entries
    await db.transaction('rw', ['fuel_logs', 'vehicles', 'sync_queue'], async () => {
      // Add fuel log
      await db.fuel_logs.add({
        id: logId,
        is_deleted: false,
        updated_at: now,
        vehicle_id: vehicleId,
        date,
        odometer_reading: odometerReading,
        cost_cents: costCents,
        gallons_or_liters: gallonsOrLiters
      });

      // Update vehicle current odometer
      const vehicle = await db.vehicles.get(vehicleId);
      if (vehicle) {
        await db.vehicles.update(vehicleId, {
          current_odometer: odometerReading,
          updated_at: now
        });

        // Create sync queue entry for fuel log
        await db.sync_queue.add({
          id: uuidv5(`sync_fuel_${logId}`, uuidv5.URL),
          table_name: 'fuel_logs',
          action: 'create',
          payload: {
            id: logId,
            is_deleted: false,
            updated_at: now,
            vehicle_id: vehicleId,
            date,
            odometer_reading: odometerReading,
            cost_cents: costCents,
            gallons_or_liters: gallonsOrLiters
          },
          timestamp: now,
          retry_count: 0
        });

        // Create sync queue entry for vehicle odometer update
        await db.sync_queue.add({
          id: uuidv5(`sync_vehicle_${vehicleId}`, uuidv5.URL),
          table_name: 'vehicles',
          action: 'update',
          payload: {
            id: vehicleId,
            current_odometer: odometerReading,
            updated_at: now
          },
          timestamp: now,
          retry_count: 0
        });
      }
    });

    return logId;
  }

  /**
   * Add maintenance log with atomic sync trigger
   */
  async addMaintenanceLog(
    vehicleId: string,
    date: string,
    odometerReading: number,
    costCents: number,
    description?: string
  ): Promise<string> {
    const logId = uuidv5(`maint_${vehicleId}_${Date.now()}`, uuidv5.URL);
    const now = new Date().toISOString();

    await db.transaction('rw', ['maintenance_logs', 'vehicles', 'sync_queue'], async () => {
      // Add maintenance log
      await db.maintenance_logs.add({
        id: logId,
        is_deleted: false,
        updated_at: now,
        vehicle_id: vehicleId,
        date,
        odometer_reading: odometerReading,
        cost_cents: costCents,
        description
      });

      // Update vehicle current odometer
      const vehicle = await db.vehicles.get(vehicleId);
      if (vehicle) {
        await db.vehicles.update(vehicleId, {
          current_odometer: odometerReading,
          updated_at: now
        });

        // Create sync queue entry for maintenance log
        await db.sync_queue.add({
          id: uuidv5(`sync_maint_${logId}`, uuidv5.URL),
          table_name: 'maintenance_logs',
          action: 'create',
          payload: {
            id: logId,
            is_deleted: false,
            updated_at: now,
            vehicle_id: vehicleId,
            date,
            odometer_reading: odometerReading,
            cost_cents: costCents,
            description
          },
          timestamp: now,
          retry_count: 0
        });

        // Create sync queue entry for vehicle odometer update
        await db.sync_queue.add({
          id: uuidv5(`sync_vehicle_${vehicleId}`, uuidv5.URL),
          table_name: 'vehicles',
          action: 'update',
          payload: {
            id: vehicleId,
            current_odometer: odometerReading,
            updated_at: now
          },
          timestamp: now,
          retry_count: 0
        });
      }
    });

    return logId;
  }
}

export const vehicleService = new VehicleService();
