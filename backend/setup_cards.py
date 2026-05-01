import requests
import sqlite3

BASE = "http://127.0.0.1:8000"

# Step 1: Add new columns to existing database (SQLite ALTER TABLE)
db_path = "finance.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if columns exist
cursor.execute("PRAGMA table_info(accounts)")
columns = [col[1] for col in cursor.fetchall()]

if "bank_name" not in columns:
    cursor.execute("ALTER TABLE accounts ADD COLUMN bank_name TEXT")
    print("Added bank_name column")

if "linked_account_id" not in columns:
    cursor.execute("ALTER TABLE accounts ADD COLUMN linked_account_id INTEGER REFERENCES accounts(id)")
    print("Added linked_account_id column")

# Step 2: Update existing accounts with bank info
# Cuenta Principal (ID 1) - Banco Guayaquil
cursor.execute("UPDATE accounts SET bank_name = 'Banco Guayaquil' WHERE id = 1")
# American Express (ID 4) - Banco Guayaquil, linked to Cuenta Principal
cursor.execute("UPDATE accounts SET bank_name = 'Banco Guayaquil', linked_account_id = 1 WHERE id = 4")
# Visa Platinum (ID 5) - Banco Guayaquil, linked to Cuenta Principal
cursor.execute("UPDATE accounts SET bank_name = 'Banco Guayaquil', linked_account_id = 1 WHERE id = 5")

conn.commit()
conn.close()
print("Updated existing accounts with bank info and links")

# Step 3: Create Dinners Club card via API
dinners = {
    "name": "Visa Titanium Euphoria",
    "account_type": "credit_card",
    "balance": -193.77,
    "currency": "USD",
    "description": "Visa TITANIUM EUPHORIA - Dinners Club. Sin cuenta de ahorros vinculada.",
    "bank_name": "Dinners Club",
    "is_active": True
}
resp = requests.post(f"{BASE}/accounts/", json=dinners)
print(f"\nDinners card created: {resp.status_code}")
dinners_data = resp.json()
dinners_id = dinners_data["id"]
print(f"Dinners ID: {dinners_id}")

# Step 4: Create statement for Dinners
dinners_stmt = {
    "account_id": dinners_id,
    "statement_balance": 64.55,
    "user_share": 64.55,
    "amount_paid": 0.0,
    "status": "pending",
    "month": 5,
    "year": 2025,
    "notes": "Visa Titanium Euphoria - Dinners Club",
    "debt_shares": []
}
resp = requests.post(f"{BASE}/statements/", json=dinners_stmt)
print(f"Dinners statement: {resp.status_code} - {resp.json()}")

# Verify all accounts
print("\n" + "=" * 80)
print("CUENTAS ACTUALIZADAS:")
print("=" * 80)
accs = requests.get(f"{BASE}/accounts").json()
for a in accs:
    linked = f" → vinculada a cuenta #{a.get('linked_account_id')}" if a.get('linked_account_id') else ""
    bank = f" [{a.get('bank_name')}]" if a.get('bank_name') else ""
    print(f"  ID:{a['id']}  {a['name']:<25} Saldo: ${a['balance']:>10.2f}{bank}{linked}")
