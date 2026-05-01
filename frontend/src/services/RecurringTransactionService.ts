/**
 * Recurring Transaction Service - Automated Subscription Processing
 * Generates transactions for active subscriptions based on billing cycles
 */

import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { prepareForAI } from '../utils/privacy';

export class RecurringTransactionService {
  /**
   * Process all recurring subscriptions
   * Creates transactions for subscriptions that are due
   * Atomic transaction per subscription to avoid duplicates
   */
  async processRecurringTransactions(): Promise<number> {
    let createdCount = 0;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    try {
      // Get all active subscriptions
      // @ts-ignore
      const subscriptions = await db.subscriptions
        .filter(s => !s.is_deleted)
        .toArray();

      for (const subscription of subscriptions) {
        try {
          // Check if transaction already exists for this month
          const monthStart = new Date(currentYear, currentMonth - 1, 1).toISOString();
          const monthEnd = new Date(currentYear, currentMonth, 0).toISOString();

          // @ts-ignore
          const existingTxn = await db.transactions
            .filter(t => 
              !t.is_deleted && 
              t.date >= monthStart && 
              t.date <= monthEnd &&
              t.subscription_id === subscription.id
            )
            .first();

          if (existingTxn) {
            // Transaction already exists for this month, skip
            continue;
          }

          // Check if billing date has passed or is today
          const nextBillingDate = new Date(subscription.next_billing_date);
          if (nextBillingDate > now) {
            // Not due yet
            continue;
          }

          // Create transaction atomically
          // @ts-ignore
          await db.transaction('rw', [db.transactions, db.accounts, db.subscriptions, db.sync_queue], async () => {
            const txnId = uuidv4();
            const nowIso = new Date().toISOString();

            // Sanitize description before creating transaction
            const sanitizedDescription = prepareForAI(subscription.name);

            const newTxn = {
              id: txnId,
              description: sanitizedDescription,
              amount: subscription.amount_cents,
              transaction_type: 'expense',
              payment_method: subscription.payment_method || 'card',
              date: nowIso,
              category_id: subscription.category_id,
              account_id: subscription.account_id,
              expense_type: 'subscription',
              subscription_id: subscription.id,
              is_deleted: false,
              created_at: nowIso,
              updated_at: nowIso
            };

            // Add transaction
            // @ts-ignore
            await db.transactions.put(newTxn);

            // Update account balance
            // @ts-ignore
            const account = await db.accounts.get(subscription.account_id);
            if (account) {
              // @ts-ignore
              await db.accounts.update(subscription.account_id, {
                balance: account.balance - subscription.amount_cents,
                updated_at: nowIso
              });
            }

            // Update subscription next_billing_date based on frequency
            let nextDate = new Date(subscription.next_billing_date);
            const frequency = subscription.frequency || 'monthly';

            if (frequency === 'monthly') {
              nextDate.setMonth(nextDate.getMonth() + 1);
            } else if (frequency === 'yearly') {
              nextDate.setFullYear(nextDate.getFullYear() + 1);
            } else if (frequency === 'weekly') {
              nextDate.setDate(nextDate.getDate() + 7);
            } else if (frequency === 'quarterly') {
              nextDate.setMonth(nextDate.getMonth() + 3);
            }

            // @ts-ignore
            await db.subscriptions.update(subscription.id, {
              next_billing_date: nextDate.toISOString(),
              updated_at: nowIso
            });

            // Add to sync queue
            // @ts-ignore
            await db.sync_queue.add({
              id: uuidv4(),
              table_name: 'transactions',
              action: 'create',
              payload: newTxn,
              timestamp: nowIso,
              retry_count: 0
            });

            // @ts-ignore
            await db.sync_queue.add({
              id: uuidv4(),
              table_name: 'subscriptions',
              action: 'update',
              payload: { id: subscription.id, next_billing_date: nextDate.toISOString(), updated_at: nowIso },
              timestamp: nowIso,
              retry_count: 0
            });

            // Trigger sync
            window.dispatchEvent(new CustomEvent('localMutation'));
          });

          createdCount++;
        } catch (error) {
          console.error(`[RecurringTransactionService] Error processing subscription ${subscription.id}:`, error);
        }
      }

      console.log(`[RecurringTransactionService] Created ${createdCount} recurring transactions`);
      return createdCount;
    } catch (error) {
      console.error('[RecurringTransactionService] Error processing recurring transactions:', error);
      return createdCount;
    }
  }
}

export const recurringTransactionService = new RecurringTransactionService();
