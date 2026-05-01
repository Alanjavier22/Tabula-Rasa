import { z } from 'zod';

// Branded type for monetary values (cents) - prevents float assignment
const CentsSchema = z.number().int('Amount must be in cents (integer)').nonnegative('Amount must be non-negative').brand<'Cents'>();

// Transaction schema - amount must be integer cents
// FASE 1: Added version and hash for immutable identity with OCC conflict resolution
export const transactionSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  amount: CentsSchema, // Branded Cents type
  description: z.string().min(1, 'Description is required'),
  date: z.string().or(z.date()),
  transaction_type: z.enum(['income', 'expense']),
  payment_method: z.enum(['cash', 'card', 'transfer', 'other']),
  is_deleted: z.boolean().optional(),
  created_at: z.string().or(z.date()).optional(),
  updated_at: z.string().or(z.date()).optional(),
  version: z.number().int().default(1), // FASE 1: Version for OCC - starts at 1
  hash: z.string().optional(), // FASE 1: SHA-256 hash for deduplication/handshake
  needs_review: z.boolean().optional(), // FASE 1: Conflict flag
});

// Account schema - balance must be integer cents
export const accountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Account name is required'),
  balance: CentsSchema, // Branded Cents type
  account_type: z.enum(['checking', 'savings', 'credit_card', 'cash']),
  is_active: z.boolean().default(true),
  linked_account_id: z.string().uuid().optional(),
  is_deleted: z.boolean().optional(),
  created_at: z.string().or(z.date()).optional(),
  updated_at: z.string().or(z.date()).optional(),
});

// Category schema - FASE 2: SRI Ecuador tax classification
export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  is_default: z.boolean().default(false),
  tax_type: z.enum(['iva_15', 'iva_0', 'exempt']).optional(), // FASE 2: SRI tax type
  is_deductible: z.boolean().optional(), // FASE 2: SRI deductible
  withholding_rate: z.number().optional(), // FASE 2: Withholding rate in base 100
  is_deleted: z.boolean().optional(),
  created_at: z.string().or(z.date()).optional(),
  updated_at: z.string().or(z.date()).optional(),
  version: z.number().int().default(1), // FASE 7: OCC versioning
  needs_review: z.boolean().optional(), // FASE 7: Conflict flag
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
