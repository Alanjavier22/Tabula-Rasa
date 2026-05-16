"""
Migration Loader for Legacy Data Import

Processes data in topological order to respect foreign key dependencies:
1. Categories (Base for everything)
2. Accounts (Needed for transactions)
3. Transactions (Reference accounts and categories)
4. Splits / DebtShares / IOUs (Depend on transactions or accounts)

Uses UUIDv5 for deterministic ID generation from legacy numeric IDs.
"""

import os
from typing import Any, Dict, List, cast
from sqlalchemy.orm import Session
from database import SessionLocal
from app.utils.uuid_mapping import generate_uuid_from_legacy_id
from app.utils.backup import prepare_for_migration, complete_migration, rollback_to_backup
from app.api.sync import recalculate_all_balances
from sqlalchemy import func


class MigrationLoader:
    """Handles legacy data migration with topological ordering."""
    
    def __init__(self, legacy_data: Dict[str, List[Dict[str, Any]]]):
        """
        Initialize loader with legacy data.
        
        Args:
            legacy_data: Dictionary with table names as keys and list of records as values
        """
        self.legacy_data = legacy_data
        self.db = SessionLocal()
        self.backup_path = None
        self.migration_stats = {
            "categories": 0,
            "accounts": 0,
            "transactions": 0,
            "splits": 0,
            "debt_shares": 0,
            "ious": 0,
            "total": 0
        }
    
    def prepare(self) -> str:
        """
        Prepare for migration: create backup + set lock + clean database.
        
        Returns:
            Path to backup file
        """
        self.backup_path = prepare_for_migration(self.db)
        
        # Clean database to ensure fresh migration state
        print("🧹 Cleaning database for fresh migration...")
        from app.models.category import Category
        from app.models.account import Account
        from app.models.transaction import Transaction
        from app.models.credit_card_statement import CreditCardStatement
        from app.models.transaction_split import TransactionSplit
        from app.models.debt_share import DebtShare
        from app.models.iou import IOU
        from app.models.budget import Budget
        from app.models.goal import Goal
        from app.models.reminder import Reminder
        from app.models.subscription import Subscription
        
        # Delete in reverse dependency order
        self.db.query(TransactionSplit).delete()
        self.db.query(DebtShare).delete()
        self.db.query(CreditCardStatement).delete()
        self.db.query(Transaction).delete()
        self.db.query(IOU).delete()
        self.db.query(Budget).delete()
        self.db.query(Goal).delete()
        self.db.query(Reminder).delete()
        self.db.query(Subscription).delete()
        self.db.query(Account).delete()
        self.db.query(Category).delete()
        
        self.db.commit()
        print("✅ Database cleaned")
        
        return self.backup_path
    
    def migrate_categories(self) -> int:
        """
        Migrate categories (Level 1 - no dependencies).
        Uses UPSERT logic to handle partial migrations.
        
        Returns:
            Number of categories migrated
        """
        from app.models.category import Category
        from sqlalchemy import insert, update
        
        if "categories" not in self.legacy_data:
            return 0
        
        count = 0
        for legacy_record in self.legacy_data["categories"]:
            legacy_id = legacy_record["id"]
            new_uuid = generate_uuid_from_legacy_id(legacy_id, "categories")
            
            # Check if already exists
            existing = self.db.query(Category).filter(Category.id == new_uuid).first()
            if existing:
                # Update existing record
                existing.name = cast(Any, legacy_record["name"])
                existing.icon = cast(Any, legacy_record.get("icon", "default"))
                existing.created_at = cast(Any, legacy_record.get("created_at", existing.created_at))
                existing.updated_at = cast(Any, legacy_record.get("updated_at", existing.updated_at))
            else:
                # Create new record
                category = Category(
                    id=new_uuid,
                    name=legacy_record["name"],
                    icon=legacy_record.get("icon", "default"),
                    created_at=legacy_record.get("created_at"),
                    updated_at=legacy_record.get("updated_at")
                )
                self.db.add(category)
            count += 1
        
        self.db.commit()
        self.migration_stats["categories"] = count
        print(f"✅ Migrated {count} categories")
        return count
    
    def migrate_accounts(self) -> int:
        """
        Migrate accounts (Level 2 - no dependencies).
        Uses UPSERT logic to handle partial migrations.
        
        Returns:
            Number of accounts migrated
        """
        from app.models.account import Account, AccountType
        
        if "accounts" not in self.legacy_data:
            return 0
        
        count = 0
        for legacy_record in self.legacy_data["accounts"]:
            legacy_id = legacy_record["id"]
            new_uuid = generate_uuid_from_legacy_id(legacy_id, "accounts")
            
            existing = self.db.query(Account).filter(Account.id == new_uuid).first()
            
            # Map account type string to enum
            account_type_str = legacy_record.get("account_type", "checking")
            try:
                account_type = AccountType(account_type_str)
            except ValueError:
                account_type = AccountType.CHECKING
            
            if existing:
                # Update existing record (preserve balance, will be recalculated)
                existing.name = cast(Any, legacy_record["name"])
                existing.account_type = cast(Any, account_type)
                existing.currency = cast(Any, legacy_record.get("currency", "USD"))
                existing.description = cast(Any, legacy_record.get("description"))
                existing.bank_name = cast(Any, legacy_record.get("bank_name"))
                existing.is_active = cast(Any, legacy_record.get("is_active", 1))
                existing.created_at = cast(Any, legacy_record.get("created_at", existing.created_at))
                existing.updated_at = cast(Any, legacy_record.get("updated_at", existing.updated_at))
            else:
                # Create new record
                account = Account(
                    id=new_uuid,
                    name=legacy_record["name"],
                    account_type=account_type,
                    balance=0,  # Will be recalculated from transactions
                    currency=legacy_record.get("currency", "USD"),
                    description=legacy_record.get("description"),
                    bank_name=legacy_record.get("bank_name"),
                    is_active=legacy_record.get("is_active", 1),
                    created_at=legacy_record.get("created_at"),
                    updated_at=legacy_record.get("updated_at")
                )
                self.db.add(account)
            count += 1
        
        self.db.commit()
        self.migration_stats["accounts"] = count
        print(f"✅ Migrated {count} accounts")
        return count
    
    def migrate_transactions(self) -> int:
        """
        Migrate transactions (Level 3 - depends on accounts and categories).
        Uses UPSERT logic to handle partial migrations.
        
        Returns:
            Number of transactions migrated
        """
        from app.models.transaction import Transaction, TransactionType, PaymentMethod, ExpenseType
        
        if "transactions" not in self.legacy_data:
            return 0
        
        count = 0
        for legacy_record in self.legacy_data["transactions"]:
            legacy_id = legacy_record["id"]
            new_uuid = generate_uuid_from_legacy_id(legacy_id, "transactions")
            
            existing = self.db.query(Transaction).filter(Transaction.id == new_uuid).first()
            
            # Map legacy account ID to UUID
            legacy_account_id = legacy_record["account_id"]
            new_account_uuid = generate_uuid_from_legacy_id(legacy_account_id, "accounts")
            
            # Map legacy category ID to UUID (if exists)
            new_category_uuid = None
            if legacy_record.get("category_id"):
                legacy_category_id = legacy_record["category_id"]
                new_category_uuid = generate_uuid_from_legacy_id(legacy_category_id, "categories")
            
            # Map enums
            try:
                tx_type_str = legacy_record["transaction_type"].lower()
                transaction_type = TransactionType(tx_type_str)
            except (ValueError, AttributeError, KeyError):
                transaction_type = TransactionType.EXPENSE
            
            try:
                payment_method = PaymentMethod(legacy_record["payment_method"].lower())
            except (ValueError, AttributeError, KeyError):
                payment_method = PaymentMethod.OTHER
            
            expense_type = None
            if legacy_record.get("expense_type"):
                try:
                    expense_type = ExpenseType(legacy_record["expense_type"].lower())
                except (ValueError, AttributeError, KeyError):
                    pass
            
            if existing:
                # Update existing record
                existing.amount = cast(Any, int(round(float(legacy_record["amount"]) * 100)))
                existing.description = cast(Any, legacy_record["description"])
                existing.transaction_type = cast(Any, transaction_type)
                existing.expense_type = cast(Any, expense_type)
                existing.payment_method = cast(Any, payment_method)
                existing.date = cast(Any, legacy_record["date"])
                existing.category_id = cast(Any, new_category_uuid)
                existing.account_id = cast(Any, new_account_uuid)
                existing.metadata_json = cast(Any, legacy_record.get("metadata_json"))
                existing.is_deleted = cast(Any, legacy_record.get("is_deleted", False))
                existing.created_at = cast(Any, legacy_record.get("created_at", existing.created_at))
                existing.updated_at = cast(Any, legacy_record.get("updated_at", existing.updated_at))
            else:
                # Create new record
                transaction = Transaction(
                    id=new_uuid,
                    amount=int(round(float(legacy_record["amount"]) * 100)),  # Convert dollars to cents
                    description=legacy_record["description"],
                    transaction_type=transaction_type,
                    expense_type=expense_type,
                    payment_method=payment_method,
                    date=legacy_record["date"],
                    category_id=new_category_uuid,
                    account_id=new_account_uuid,
                    metadata_json=legacy_record.get("metadata_json"),
                    is_deleted=legacy_record.get("is_deleted", False),
                    created_at=legacy_record.get("created_at"),
                    updated_at=legacy_record.get("updated_at")
                )
                self.db.add(transaction)
            count += 1
        
        self.db.commit()
        self.migration_stats["transactions"] = count
        print(f"✅ Migrated {count} transactions")
        return count
    
    def migrate_splits(self) -> int:
        """
        Migrate transaction splits (Level 4 - depends on transactions).
        
        Returns:
            Number of splits migrated
        """
        from app.models.transaction_split import TransactionSplit
        
        if "transaction_splits" not in self.legacy_data:
            return 0
        
        count = 0
        for legacy_record in self.legacy_data["transaction_splits"]:
            legacy_id = legacy_record["id"]
            new_uuid = generate_uuid_from_legacy_id(legacy_id, "transaction_splits")
            
            existing = self.db.query(TransactionSplit).filter(TransactionSplit.id == new_uuid).first()
            if existing:
                continue
            
            # Map legacy transaction ID to UUID
            legacy_tx_id = legacy_record["transaction_id"]
            new_tx_uuid = generate_uuid_from_legacy_id(legacy_tx_id, "transactions")
            
            # Map legacy category ID to UUID (if exists)
            new_category_uuid = None
            if legacy_record.get("category_id"):
                legacy_category_id = legacy_record["category_id"]
                new_category_uuid = generate_uuid_from_legacy_id(legacy_category_id, "categories")
            
            split = TransactionSplit(
                id=new_uuid,
                amount=int(round(float(legacy_record["amount"]) * 100)),
                transaction_id=new_tx_uuid,
                category_id=new_category_uuid,
                description=legacy_record.get("description")
            )
            self.db.add(split)
            count += 1
        
        self.db.commit()
        self.migration_stats["splits"] = count
        print(f"✅ Migrated {count} splits")
        return count
    
    def migrate_credit_card_statements(self) -> int:
        """
        Migrate credit card statements (Level 3 - depends on accounts).
        
        Returns:
            Number of statements migrated
        """
        from app.models.credit_card_statement import CreditCardStatement
        
        if "credit_card_statements" not in self.legacy_data:
            return 0
        
        count = 0
        for legacy_record in self.legacy_data["credit_card_statements"]:
            legacy_id = legacy_record["id"]
            new_uuid = generate_uuid_from_legacy_id(legacy_id, "credit_card_statements")
            
            existing = self.db.query(CreditCardStatement).filter(CreditCardStatement.id == new_uuid).first()
            if existing:
                continue
            
            # Map legacy account ID to UUID
            legacy_account_id = legacy_record["account_id"]
            new_account_uuid = generate_uuid_from_legacy_id(legacy_account_id, "accounts")
            
            statement = CreditCardStatement(
                id=new_uuid,
                account_id=new_account_uuid,
                statement_balance=int(round(float(legacy_record.get("statement_balance", 0)) * 100)),
                user_share=int(round(float(legacy_record.get("user_share", 0)) * 100)),
                payment_due_date=legacy_record.get("payment_due_date"),
                cut_off_date=legacy_record.get("cut_off_date"),
                amount_paid=int(round(float(legacy_record.get("amount_paid", 0)) * 100)),
                status=legacy_record.get("status", "pending"),
                month=legacy_record.get("month"),
                year=legacy_record.get("year"),
                notes=legacy_record.get("notes"),
                created_at=legacy_record.get("created_at"),
                updated_at=legacy_record.get("updated_at")
            )
            self.db.add(statement)
            count += 1
        
        self.db.commit()
        self.migration_stats["credit_card_statements"] = count
        print(f"✅ Migrated {count} credit card statements")
        return count
    
    def migrate_debt_shares(self) -> int:
        """
        Migrate debt shares (Level 4 - depends on credit_card_statements).
        
        Returns:
            Number of debt shares migrated
        """
        from app.models.debt_share import DebtShare
        
        if "debt_shares" not in self.legacy_data:
            return 0
        
        count = 0
        for legacy_record in self.legacy_data["debt_shares"]:
            legacy_id = legacy_record["id"]
            new_uuid = generate_uuid_from_legacy_id(legacy_id, "debt_shares")
            
            existing = self.db.query(DebtShare).filter(DebtShare.id == new_uuid).first()
            if existing:
                continue
            
            # Map legacy statement ID to UUID (debt_shares reference credit_card_statements)
            legacy_statement_id = legacy_record.get("statement_id")
            if not legacy_statement_id:
                print(f"  ⚠️  Skipping debt share {legacy_id}: missing statement reference")
                continue
            
            new_statement_uuid = generate_uuid_from_legacy_id(legacy_statement_id, "credit_card_statements")
            
            debt_share = DebtShare(
                id=new_uuid,
                amount=int(round(float(legacy_record["amount"]) * 100)),
                statement_id=new_statement_uuid,
                person_name=legacy_record["person_name"],
                description=legacy_record.get("description"),
                status=legacy_record.get("status", "pending")
            )
            self.db.add(debt_share)
            count += 1
        
        self.db.commit()
        self.migration_stats["debt_shares"] = count
        print(f"✅ Migrated {count} debt shares")
        return count
    
    def migrate_ious(self) -> int:
        """
        Migrate IOUs (Level 4 - depends on accounts).
        
        Returns:
            Number of IOUs migrated
        """
        from app.models.iou import IOU, IOUType, IOUStatus
        
        if "ious" not in self.legacy_data:
            return 0
        
        count = 0
        for legacy_record in self.legacy_data["ious"]:
            legacy_id = legacy_record["id"]
            new_uuid = generate_uuid_from_legacy_id(legacy_id, "ious")
            
            existing = self.db.query(IOU).filter(IOU.id == new_uuid).first()
            if existing:
                continue
            
            # Map legacy account ID to UUID
            new_account_uuid = None
            if legacy_record.get("account_id"):
                legacy_account_id = legacy_record["account_id"]
                new_account_uuid = generate_uuid_from_legacy_id(legacy_account_id, "accounts")
            
            # Map IOU type
            try:
                iou_type = IOUType(legacy_record["iou_type"])
            except ValueError:
                iou_type = IOUType.THEY_OWE
            
            # Map IOU status
            try:
                iou_status = IOUStatus(legacy_record["status"])
            except ValueError:
                iou_status = IOUStatus.PENDING
            
            iou = IOU(
                id=new_uuid,
                amount=int(round(float(legacy_record["amount"]) * 100)),
                person_name=legacy_record["person_name"],
                description=legacy_record["description"],
                iou_type=iou_type,
                status=iou_status,
                account_id=new_account_uuid,
                due_date=legacy_record.get("due_date"),
                created_at=legacy_record.get("created_at"),
                updated_at=legacy_record.get("updated_at")
            )
            self.db.add(iou)
            count += 1
        
        self.db.commit()
        self.migration_stats["ious"] = count
        print(f"✅ Migrated {count} IOUs")
        return count
    
    def execute_migration(self, skip_balance_recalc: bool = False) -> Dict[str, Any]:
        """
        Execute full migration in topological order.
        
        Args:
            skip_balance_recalc: If True, skip balance recalculation (do manually later)
            
        Returns:
            Migration statistics
        """
        print("🚀 Starting migration in topological order...")
        
        try:
            # Level 1: Categories (no dependencies)
            self.migrate_categories()
            
            # Level 2: Accounts (no dependencies)
            self.migrate_accounts()
            
            # Level 3: Transactions (depends on accounts + categories)
            self.migrate_transactions()
            
            # Level 3.5: Credit card statements (depends on accounts, needed for debt_shares)
            self.migrate_credit_card_statements()
            
            # Level 4: Dependent entities
            self.migrate_splits()
            self.migrate_debt_shares()
            self.migrate_ious()
            
            # Recalculate balances
            if not skip_balance_recalc:
                print("🔄 Recalculating account balances...")
                recalculate_all_balances(self.db)
            
            # Calculate total
            self.migration_stats["total"] = sum(self.migration_stats.values())
            
            # Complete migration
            complete_migration(self.db)
            
            print(f"✅ Migration completed successfully!")
            print(f"📊 Stats: {self.migration_stats}")
            
            return self.migration_stats
            
        except Exception as e:
            print(f"❌ Migration failed: {e}")
            if self.backup_path:
                print(f"🔄 Rolling back to backup: {self.backup_path}")
                rollback_to_backup(self.backup_path, self.db)
            raise
    
    def rollback(self) -> None:
        """
        Rollback migration using backup.
        """
        if not self.backup_path:
            raise RuntimeError("No backup available for rollback")
        
        rollback_to_backup(self.backup_path, self.db)
    
    def close(self) -> None:
        """Close database session."""
        self.db.close()


def run_migration(legacy_data: Dict[str, List[Dict[str, Any]]], skip_balance_recalc: bool = False) -> Dict[str, Any]:
    """
    Convenience function to run migration.
    
    Args:
        legacy_data: Dictionary with table names and records
        skip_balance_recalc: Skip balance recalculation
        
    Returns:
        Migration statistics
    """
    loader = MigrationLoader(legacy_data)
    try:
        loader.prepare()
        stats = loader.execute_migration(skip_balance_recalc=skip_balance_recalc)
        return stats
    finally:
        loader.close()


def verify_migration_integrity(expected_total_cents: int) -> Dict[str, Any]:
    """
    Verify financial integrity after migration using checksum validation.
    
    1. Recalculate all account balances from transactions
    2. Sum all active account balances
    3. Compare with expected total from legacy DB
    4. Report any discrepancies (cent leakage)
    
    Args:
        expected_total_cents: Expected total balance from legacy DB (in cents)
        
    Returns:
        Dictionary with verification results
    """
    db = SessionLocal()
    
    try:
        # Recalculate all balances first
        print("🔄 Recalculating all account balances...")
        updated_count = recalculate_all_balances(db)
        db.commit()
        print(f"✅ Recalculated {updated_count} account balances")
        
        # Sum all active account balances
        from app.models.account import Account
        actual_total = cast(Any, db.query(func.sum(Account.balance)).filter(
            Account.is_deleted == False
        ).scalar())
        
        actual_total = actual_total if actual_total is not None else 0
        
        # Calculate difference
        difference = actual_total - expected_total_cents
        
        result = {
            "expected_total_cents": expected_total_cents,
            "actual_total_cents": actual_total,
            "difference_cents": difference,
            "accounts_updated": updated_count,
            "status": "FAILED" if difference != 0 else "SUCCESS"
        }
        
        if difference != 0:
            print(f"❌ INTEGRITY CHECK FAILED: Difference of {difference} cents detected!")
            print(f"   Expected: ${expected_total_cents / 100:.2f}")
            print(f"   Actual: ${actual_total / 100:.2f}")
            print(f"   Difference: ${difference / 100:.2f}")
        else:
            print(f"✅ INTEGRITY CHECK PASSED: No cent leakage detected")
            print(f"   Total verified: ${actual_total / 100:.2f}")
        
        return result
        
    finally:
        db.close()
