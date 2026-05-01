import requests

BASE = "http://127.0.0.1:8000"

# Get account IDs
accounts = requests.get(f"{BASE}/accounts").json()
amex_id = None
visa_id = None
for acc in accounts:
    if "American Express" in acc["name"]:
        amex_id = acc["id"]
    if "Visa Platinum" in acc["name"]:
        visa_id = acc["id"]

print(f"Amex ID: {amex_id}, Visa ID: {visa_id}")

# American Express - May 2025 statement
# Total statement: $88.86
# User paid: $22.99 (Google One)
# Friend 1 owes: $23.25
# Friend 2 owes: $23.58
# Remaining user share after friends pay: $0 (already paid $22.99)
amex_statement = {
    "account_id": amex_id,
    "statement_balance": 88.86,
    "user_share": 22.99,
    "amount_paid": 22.99,
    "status": "partial",
    "month": 5,
    "year": 2025,
    "notes": "Google One pagado. Esperando transferencias de amigos.",
    "debt_shares": [
        {
            "person_name": "Amigo 1",
            "amount": 23.25,
            "description": "Cargo compartido Amex",
            "status": "pending"
        },
        {
            "person_name": "Amigo 2",
            "amount": 23.58,
            "description": "Cargo compartido Amex",
            "status": "pending"
        }
    ]
}

resp = requests.post(f"{BASE}/statements/", json=amex_statement)
print(f"Amex statement: {resp.status_code} - {resp.json()}")

# Visa Platinum - May 2025 statement
# Total statement: $161.35
# User share: $145.18
# Someone else: $161.35 - $145.18 = $16.17
visa_statement = {
    "account_id": visa_id,
    "statement_balance": 161.35,
    "user_share": 145.18,
    "amount_paid": 0.0,
    "status": "pending",
    "month": 5,
    "year": 2025,
    "notes": "Pendiente de pago",
    "debt_shares": [
        {
            "person_name": "Otra persona",
            "amount": 16.17,
            "description": "Cargo compartido Visa",
            "status": "pending"
        }
    ]
}

resp = requests.post(f"{BASE}/statements/", json=visa_statement)
print(f"Visa statement: {resp.status_code} - {resp.json()}")

print("\nStatements created successfully!")
