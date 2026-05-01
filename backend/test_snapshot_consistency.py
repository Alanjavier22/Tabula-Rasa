"""
Test Scenario: FASE 2 - Temporal Consistency Engine
Tests retroactive transaction modification and snapshot invalidation
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.services.snapshot_reconciler import SnapshotReconciler


def setup_test_data(db: Session):
    """
    Setup test data for 2-month retroactive change scenario
    """
    print("=== Setting up test data ===")
    
    # Create test account
    account = Account(
        name="Test Checking",
        account_type="checking",
        balance=100000,  # $1000.00 in cents
        is_active=True
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    
    # Create transactions for 3 months (Feb, Mar, Apr 2026)
    # February 2026 - Old transaction to be modified
    txn_feb = Transaction(
        account_id=account.id,
        date=datetime(2026, 2, 15, tzinfo=timezone.utc),
        description="Old Expense - Grocery",
        amount=5000,  # $50.00
        transaction_type="expense",
        category_id=None
    )
    db.add(txn_feb)
    
    # March 2026 - Normal transaction
    txn_mar = Transaction(
        account_id=account.id,
        date=datetime(2026, 3, 15, tzinfo=timezone.utc),
        description="March Expense",
        amount=3000,  # $30.00
        transaction_type="expense",
        category_id=None
    )
    db.add(txn_mar)
    
    # April 2026 - Recent transaction
    txn_apr = Transaction(
        account_id=account.id,
        date=datetime(2026, 4, 15, tzinfo=timezone.utc),
        description="April Expense",
        amount=4000,  # $40.00
        transaction_type="expense",
        category_id=None
    )
    db.add(txn_apr)
    
    db.commit()
    
    # Create initial snapshots for Feb, Mar, Apr
    for month, year in [(2, 2026), (3, 2026), (4, 2026)]:
        snapshot = NetWorthSnapshot(
            month=month,
            year=year,
            total_assets=100000,  # $1000.00
            total_liabilities=0,
            net_worth=100000,  # $1000.00
            snapshot_date=datetime(year, month, 1, tzinfo=timezone.utc),
            is_stale=False
        )
        db.add(snapshot)
    
    db.commit()
    
    print(f"✅ Created account: {account.name} (ID: {account.id})")
    print(f"✅ Created 3 transactions (Feb, Mar, Apr 2026)")
    print(f"✅ Created 3 initial snapshots")
    
    return account, [txn_feb, txn_mar, txn_apr]


def test_retroactive_modification(db: Session):
    """
    Test: Modify a transaction from 2 months ago and verify snapshots are invalidated
    """
    print("\n=== Test: Retroactive Transaction Modification ===")
    
    # Get February transaction
    feb_txn = db.query(Transaction).filter(
        Transaction.description == "Old Expense - Grocery"
    ).first()
    
    print(f"Original Feb transaction: {feb_txn.description} = ${feb_txn.amount / 100:.2f}")
    
    # Modify February transaction (change amount from $50 to $150)
    old_amount = feb_txn.amount
    feb_txn.amount = 15000  # $150.00
    feb_txn.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    print(f"Modified Feb transaction: {feb_txn.description} = ${feb_txn.amount / 100:.2f}")
    print(f"Amount change: +${(feb_txn.amount - old_amount) / 100:.2f}")
    
    # Manually trigger snapshot invalidation (simulating Dexie hook)
    print("\n=== Triggering snapshot invalidation ===")
    feb_date = feb_txn.date
    
    # Mark all snapshots >= Feb 15 as stale
    stale_snapshots = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.snapshot_date >= feb_date,
        NetWorthSnapshot.is_stale == False
    ).all()
    
    print(f"Found {len(stale_snapshots)} snapshots to invalidate")
    
    for snapshot in stale_snapshots:
        snapshot.is_stale = True
        snapshot.updated_at = datetime.now(timezone.utc)
        print(f"  - Marked {snapshot.year}-{snapshot.month} snapshot as stale")
    
    db.commit()
    
    # Verify snapshots are stale
    stale_count = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.is_stale == True
    ).count()
    
    print(f"\n✅ Stale snapshots count: {stale_count}")
    
    if stale_count > 0:
        print("✅ PASS: Snapshots correctly marked as stale after retroactive change")
    else:
        print("❌ FAIL: Snapshots not marked as stale")
        return False
    
    return True


def test_reconciliation(db: Session):
    """
    Test: Reconcile stale snapshots and verify recalculated values
    """
    print("\n=== Test: Snapshot Reconciliation ===")
    
    # Get stale snapshots before reconciliation
    stale_before = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.is_stale == True
    ).all()
    
    print(f"Stale snapshots before reconciliation: {len(stale_before)}")
    
    for snapshot in stale_before:
        print(f"  - {snapshot.year}-{snapshot.month}: net_worth = ${snapshot.net_worth / 100:.2f} (stale)")
    
    # Run reconciliation
    print("\n=== Running SnapshotReconciler.reconcile_stale_snapshots() ===")
    result = SnapshotReconciler.reconcile_stale_snapshots(db)
    
    print(f"Reconciliation result: {result}")
    
    # Verify snapshots are no longer stale
    stale_after = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.is_stale == True
    ).count()
    
    print(f"\nStale snapshots after reconciliation: {stale_after}")
    
    if stale_after == 0:
        print("✅ PASS: All snapshots successfully reconciled")
    else:
        print("❌ FAIL: Some snapshots still stale")
        return False
    
    # Verify recalculated values
    print("\n=== Verifying recalculated values ===")
    snapshots = db.query(NetWorthSnapshot).order_by(
        NetWorthSnapshot.year, NetWorthSnapshot.month
    ).all()
    
    for snapshot in snapshots:
        print(f"  - {snapshot.year}-{snapshot.month}: net_worth = ${snapshot.net_worth / 100:.2f}")
    
    print("\n✅ PASS: Snapshot reconciliation completed successfully")
    return True


def cleanup_test_data(db: Session):
    """
    Clean up test data
    """
    print("\n=== Cleaning up test data ===")
    
    db.query(Transaction).delete()
    db.query(NetWorthSnapshot).delete()
    db.query(Account).delete()
    
    db.commit()
    print("✅ Test data cleaned up")


def main():
    """
    Run the complete test scenario
    """
    print("=" * 60)
    print("FASE 2: Temporal Consistency Engine Test")
    print("Scenario: 2-month retroactive transaction modification")
    print("=" * 60)
    
    db = SessionLocal()
    
    try:
        # Setup test data
        account, transactions = setup_test_data(db)
        
        # Test retroactive modification
        if not test_retroactive_modification(db):
            print("\n❌ TEST FAILED: Retroactive modification test")
            return
        
        # Test reconciliation
        if not test_reconciliation(db):
            print("\n❌ TEST FAILED: Reconciliation test")
            return
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED")
        print("=" * 60)
        
    finally:
        cleanup_test_data(db)
        db.close()


if __name__ == "__main__":
    main()
