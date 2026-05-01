import { z } from 'zod';

// Branded type for monetary values (cents) - prevents float assignment
const CentsSchema = z.number().int('Amount must be in cents (integer)').nonnegative('Amount must be non-negative').brand<'Cents'>();

// Transaction schema - amount must be integer cents
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

export type TransactionInput = z.infer<typeof transactionSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
