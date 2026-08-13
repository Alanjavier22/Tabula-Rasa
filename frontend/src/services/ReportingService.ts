/**
 * ReportingService - Reglas fiscales de Ecuador compartidas en memoria.
 *
 * Antes tenía un motor de reportes/agregación completo sobre IndexedDB (Dexie),
 * pero esa capa nunca se completó (ver TECH_DEBT.md #11) y ningún componente
 * real de la UI lo llamaba - se eliminó junto al resto del código huérfano que
 * dependía del stub de Dexie. Lo único que sí usa la UI (Dashboard.tsx) es
 * `setFiscalRules`, que sólo guarda las reglas fiscales en memoria.
 */

export interface EcuadorFiscalRules {
  iva_rate: number; // 15%
  retencion_source_rate: number; // 1% (configurable)
  retencion_iva_rate: number; // 30% del IVA (configurable)
}

export class ReportingService {
  private fiscalRules: EcuadorFiscalRules = {
    iva_rate: 0.15, // 15% IVA Ecuador (default)
    retencion_source_rate: 0.01, // 1% retención fuente
    retencion_iva_rate: 0.30, // 30% del IVA
  };

  /**
   * Update fiscal rules from external config (e.g. backend)
   */
  setFiscalRules(rules: Partial<EcuadorFiscalRules>): void {
    this.fiscalRules = { ...this.fiscalRules, ...rules };
  }

  getFiscalRules(): EcuadorFiscalRules {
    return this.fiscalRules;
  }
}

export const reportingService = new ReportingService();
