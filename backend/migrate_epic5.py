"""
Migration script for Epic 5: Vehicle Telemetry
Adds metadata_json column to transactions table for SQLite
"""
import sqlite3
import os

# Get database path
db_path = os.path.join(os.path.dirname(__file__), 'finance.db')

print(f"Migrating database at: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Check if column already exists
    cursor.execute("PRAGMA table_info(transactions)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if 'metadata_json' in columns:
        print("Column metadata_json already exists. Skipping migration.")
    else:
        # Add the column
        cursor.execute("ALTER TABLE transactions ADD COLUMN metadata_json TEXT")
        conn.commit()
        print("✓ Successfully added metadata_json column to transactions table")
    
    # Verify the column was added
    cursor.execute("PRAGMA table_info(transactions)")
    columns = [column[1] for column in cursor.fetchall()]
    print(f"Current columns: {columns}")
    
except Exception as e:
    print(f"Error during migration: {e}")
    conn.rollback()
finally:
    conn.close()
