import Decimal from 'decimal.js-light';
import type { Cents } from '../types';

/**
 * Convierte cualquier valor (string, number, null, undefined) a Decimal de forma segura.
 * El backend puede devolver montos como strings (Decimal de Python) para preservar precisión.
 */
export const toDecimal = (value: unknown): Decimal => {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  
  let normalizedValue = value;
  
  // Si es un string, normalizamos comas a puntos para que Decimal lo entienda
  if (typeof value === 'string') {
    normalizedValue = value.replace(',', '.');
  }

  try {
    return new Decimal(normalizedValue as string | number | Decimal);
  } catch {
    return new Decimal(0);
  }
};

/**
 * Formatea un valor monetario a string con N decimales (default 2).
 * IMPORTANTE: El input debe estar en CENTAVOS (enteros). Divide por 100 internamente.
 * A prueba de tipos: acepta string, number, null, undefined.
 */
export const formatMoney = (value: unknown, decimals = 2): string => {
  const cents = toDecimal(value);
  return cents.dividedBy(100).toFixed(decimals);
};

/**
 * Convierte input del usuario (string "150.50" o float) a centavos (enteros).
 * Usa Decimal para evitar pérdida de precisión IEEE 754.
 * Devuelve el número entero absoluto como tipo Cents (branded).
 */
export const toCents = (value: unknown): Cents => {
  const d = toDecimal(value);
  return Math.round(d.mul(100).toNumber()) as Cents;
};

/**
 * Convierte un valor a number nativo, validado por Decimal.
 * Útil para enviar payloads al backend manteniendo precisión en el parseo.
 */
export const toNumber = (value: unknown): number => {
  return toDecimal(value).toNumber();
};

/**
 * Devuelve el valor si es positivo, o Decimal(0) si es negativo.
 * Equivalente a Math.max(0, x) pero con precisión Decimal.
 */
export const clampZero = (value: unknown): Decimal => {
  const d = toDecimal(value);
  return d.gt(0) ? d : new Decimal(0);
};
