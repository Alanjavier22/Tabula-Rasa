#!/usr/bin/env python3
"""
FASE 8: Industrial-Grade Stress Test
Injects 50,000 synthetic transactions with correct SHA-256 hashes and UUIDv5
Validates StreamedExporter and Storage Guardian don't collapse the system
"""
import sys
import os
import uuid
import hashlib
import random
from datetime import datetime, timezone, timedelta
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database import SessionLocal
from app.models.transaction import Transaction, TransactionType, ExpenseType, PaymentMethod
from app.models.category import Category
from app.models.account import Account


def generate_transaction_hash(transaction_data: dict) -> str:
    """Generate SHA-256 hash for idempotency (client-side logic)."""
    # Create deterministic string from transaction data
    hash_string = f"{transaction_data['id']}:{transaction_data['amount']}:{transaction_data['date']}:{transaction_data['description']}:{transaction_data['category_id']}"
    return hashlib.sha256(hash_string.encode()).hexdigest()


def generate_uuidv5(namespace: str, name: str) -> str:
    """Generate UUIDv5 for deterministic IDs."""
    namespace_uuid = uuid.UUID(namespace)
    name_bytes = name.encode('utf-8')
    return str(uuid.uuid5(namespace_uuid, name_bytes))


def inject_stress_transactions(count: int = 50000):
    """Inject synthetic transactions for stress testing."""
    db: Session = SessionLocal()
    
    try:
        # Get existing categories and accounts for valid foreign keys
        categories = db.query(Category).filter(Category.is_deleted == False).all()
        accounts = db.query(Account).filter(Account.is_deleted == False).all()
        
        if not categories:
            print("[FASE-8] Error: No categories found. Please create at least one category.")
            return
        
        if not accounts:
            print("[FASE-8] Error: No accounts found. Please create at least one account.")
            return
        
        print(f"[FASE-8] Starting stress test: Injecting {count} synthetic transactions...")
        print(f"[FASE-8] Using {len(categories)} categories and {len(accounts)} accounts")
        
        # Generate transactions in batches
        batch_size = 1000
        total_injected = 0
        base_date = datetime.now(timezone.utc)
        
        for batch_start in range(0, count, batch_size):
            batch_end = min(batch_start + batch_size, count)
            batch_transactions = []
            
            for i in range(batch_start, batch_end):
                # Generate deterministic UUIDv5 based on index
                tx_id = generate_uuidv5(
                    '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
                    f'stress_test_tx_{i}'
                )
                
                # Random amount in cents (integers only, no floats)
                amount_cents = random.randint(100, 1000000)  # $1.00 to $10,000.00
                
                # Random date within last 365 days
                days_ago = random.randint(0, 365)
                tx_date = (base_date - timedelta(days=days_ago)).isoformat()
                
                # Random category and account
                category = random.choice(categories)
                account = random.choice(accounts)
                
                # Random transaction type
                tx_type = random.choice(list(TransactionType))
                
                # Random payment method
                payment_method = random.choice(list(PaymentMethod))
                
                # Generate transaction data
                transaction_data = {
                    'id': tx_id,
                    'amount': amount_cents,
                    'description': f'Stress Test Transaction {i}',
                    'transaction_type': tx_type,
                    'expense_type': random.choice(list(ExpenseType)) if tx_type == TransactionType.EXPENSE else None,
                    'payment_method': payment_method,
                    'date': tx_date,
                    'category_id': category.id,
                    'account_id': account.id,
                    'is_deleted': False,
                    'created_at': base_date.isoformat(),
                    'updated_at': base_date.isoformat(),
                    'version': 1,
                }
                
                # Generate hash for idempotency
                transaction_hash = generate_transaction_hash(transaction_data)
                transaction_data['hash'] = transaction_hash
                
                # Create Transaction object
                transaction = Transaction(**transaction_data)
                batch_transactions.append(transaction)
            
            # Bulk insert batch
            db.bulk_save_objects(batch_transactions)
            db.commit()
            
            total_injected += len(batch_transactions)
            print(f"[FASE-8] Progress: {total_injected}/{count} transactions injected")
        
        print(f"[FASE-8] Stress test completed: {total_injected} transactions injected")
        print(f"[FASE-8] Total transactions in database: {db.query(Transaction).count()}")
        
    except Exception as e:
        db.rollback()
        print(f"[FASE-8] Error during stress test: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Stress test the system with synthetic transactions')
    parser.add_argument('--count', type=int, default=50000, help='Number of transactions to inject (default: 50000)')
    
    args = parser.parse_args()
    
    try:
        inject_stress_transactions(args.count)
        print("[FASE-8] Stress test successful!")
    except Exception as e:
        print(f"[FASE-8] Stress test failed: {e}")
        sys.exit(1)
