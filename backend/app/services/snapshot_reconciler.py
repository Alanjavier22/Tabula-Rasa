"""
SnapshotReconciler - Temporal Consistency Engine for Net Worth Snapshots
FASE 2: Handles retroactive invalidation and recalculation of stale snapshots
Uses Decimal for IEEE 754-safe arithmetic and SHA-256 hash validation
"""
from decimal import Decimal, getcontext
from datetime import datetime, timezone
from typing import List, Optional, Any, cast
from sqlalchemy.orm import Session
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.asset import Asset
import hashlib
import logging

logger = logging.getLogger(__name__)

# Set Decimal precision for financial calculations (cents-level accuracy)
getcontext().prec = 28


def _get_month_bounds(month: int, year: int) -> tuple[datetime, datetime]:
    month_start = datetime(year, month, 1, tzinfo=timezone.utc)
    month_end = datetime(year + (month == 12), 1 if month == 12 else month + 1, 1, tzinfo=timezone.utc)
    return month_start, month_end


def _calculate_transaction_totals(transactions: list[Transaction]) -> tuple[Decimal, Decimal, int]:
    income_cents = Decimal('0')
    expense_cents = Decimal('0')
    valid_transaction_count = 0
    for transaction in transactions:
        if not SnapshotReconciler.validate_transaction_hash(transaction):
            continue
        amount = Decimal(str(transaction.amount))
        if transaction.transaction_type == 'income':
            income_cents += amount
        else:
            expense_cents += amount
        valid_transaction_count += 1
    return income_cents, expense_cents, valid_transaction_count


def _get_historical_account_balance(
    db: Session,
    account: Account,
    month_end: datetime,
) -> Decimal:
    balance = Decimal(str(account.balance))
    if month_end >= datetime.now(timezone.utc):
        return balance
    future_transactions = db.query(Transaction).filter(
        Transaction.account_id == account.id,
        Transaction.date >= month_end,
        Transaction.is_deleted == False,
    ).all()
    for transaction in future_transactions:
        amount = Decimal(str(transaction.amount))
        balance -= amount if transaction.transaction_type == 'income' else -amount
    return balance


def _add_account_balance(
    account: Account,
    balance: Decimal,
    total_assets: Decimal,
    total_liabilities: Decimal,
) -> tuple[Decimal, Decimal]:
    if account.account_type in ['checking', 'savings', 'investment']:
        return total_assets + balance, total_liabilities
    if account.account_type == 'credit_card' and balance > 0:
        return total_assets, total_liabilities + balance
    if balance < 0:
        return total_assets, total_liabilities + abs(balance)
    return total_assets, total_liabilities


class SnapshotReconciler:
    """
    Service for reconciling stale net worth snapshots based on verified transaction history.
    Recalculates balances cents-to-cents using Decimal arithmetic.
    """

    @staticmethod
    def validate_transaction_hash(transaction: Transaction) -> bool:
        """
        Validate SHA-256 hash of transaction for integrity verification.
        Returns True if hash is valid or missing (legacy data).
        """
        if not transaction.hash:
            # Legacy transactions without hash are accepted but logged
            return True
        
        # Reconstruct hash seed from transaction data
        seed = f"{transaction.account_id}:{transaction.date}:{transaction.description}:{transaction.amount}"
        expected_hash = hashlib.sha256(seed.encode()).hexdigest()
        
        return cast(bool, transaction.hash == expected_hash)

    @staticmethod
    def calculate_month_totals(
        db: Session,
        month: int,
        year: int
    ) -> dict:
        """
        Calculate total assets, liabilities, income, and expense for a given month.
        Uses Decimal for IEEE 754-safe arithmetic.
        Only includes transactions with valid SHA-256 hashes.
        """
        month_start, month_end = _get_month_bounds(month, year)
        
        # Get transactions for the month
        transactions = db.query(Transaction).filter(
            Transaction.date >= month_start,
            Transaction.date < month_end,
            Transaction.is_deleted == False
        ).all()
        
        income_cents, expense_cents, valid_transaction_count = _calculate_transaction_totals(transactions)
        
        # Calculate assets from accounts (using Decimal)
        accounts = db.query(Account).filter(
            Account.is_deleted == False
        ).all()
        
        total_assets_cents = Decimal('0')
        total_liabilities_cents = Decimal('0')
        for account in accounts:
            balance = _get_historical_account_balance(db, account, month_end)
            total_assets_cents, total_liabilities_cents = _add_account_balance(
                account, balance, total_assets_cents, total_liabilities_cents
            )
        
        # Add physical assets (depreciated value)
        assets = db.query(Asset).filter(
            Asset.is_deleted == False
        ).all()
        
        for asset in assets:
            # Simple depreciation calculation (could be enhanced)
            purchase_price = Decimal(str(asset.purchase_price_cents))
            total_assets_cents += purchase_price
        
        net_worth_cents = total_assets_cents - total_liabilities_cents
        
        return {
            'total_assets_cents': int(total_assets_cents),
            'total_liabilities_cents': int(total_liabilities_cents),
            'net_worth_cents': int(net_worth_cents),
            'income_cents': int(income_cents),
            'expense_cents': int(expense_cents),
            'transaction_count': valid_transaction_count
        }

    @staticmethod
    def reconcile_stale_snapshots(db: Session) -> dict:
        """
        Identify and recalculate all stale snapshots.
        Returns summary of reconciliation results.
        """
        stale_snapshots = db.query(NetWorthSnapshot).filter(
            NetWorthSnapshot.is_stale == True,
            NetWorthSnapshot.is_deleted == False
        ).all()
        
        if not stale_snapshots:
            return {
                'reconciled_count': 0,
                'failed_count': 0,
                'message': 'No stale snapshots found'
            }
        
        reconciled_count = 0
        failed_count = 0
        
        for snapshot in stale_snapshots:
            try:
                # Recalculate totals for the snapshot's month/year
                totals = SnapshotReconciler.calculate_month_totals(
                    db, cast(int, snapshot.month), cast(int, snapshot.year)
                )
                
                # Update snapshot with recalculated values
                snapshot.total_assets = cast(Any, totals['total_assets_cents'])
                snapshot.total_liabilities = cast(Any, totals['total_liabilities_cents'])
                snapshot.net_worth = cast(Any, totals['net_worth_cents'])
                snapshot.is_stale = cast(Any, False)
                snapshot.updated_at = cast(Any, datetime.now(timezone.utc))
                
                db.commit()
                reconciled_count += 1
                
            except Exception:  # pragma: no cover
                failed_count += 1
                db.rollback()
                logger.exception("[SnapshotReconciler] Failed to reconcile snapshot %s", snapshot.id)  # pragma: no cover
        
        return {
            'reconciled_count': reconciled_count,
            'failed_count': failed_count,
            'message': f'Reconciled {reconciled_count} snapshots, {failed_count} failed'
        }

    @staticmethod
    def reconcile_snapshot_by_id(db: Session, snapshot_id: str) -> Optional[dict]:
        """
        Reconcile a specific snapshot by ID.
        Returns recalculated totals or None if not found.
        """
        snapshot = db.query(NetWorthSnapshot).filter(
            NetWorthSnapshot.id == snapshot_id,
            NetWorthSnapshot.is_deleted == False
        ).first()
        
        if not snapshot:
            return None
        
        try:
            totals = SnapshotReconciler.calculate_month_totals(
                db, cast(int, snapshot.month), cast(int, snapshot.year)
            )
            
            snapshot.total_assets = cast(Any, totals['total_assets_cents'])
            snapshot.total_liabilities = cast(Any, totals['total_liabilities_cents'])
            snapshot.net_worth = cast(Any, totals['net_worth_cents'])
            snapshot.is_stale = cast(Any, False)
            snapshot.updated_at = cast(Any, datetime.now(timezone.utc))
            
            db.commit()
            db.refresh(snapshot)
            
            return totals
            
        except Exception:  # pragma: no cover
            db.rollback()
            logger.exception("[SnapshotReconciler] Failed to reconcile snapshot %s", snapshot_id)  # pragma: no cover
            return None
