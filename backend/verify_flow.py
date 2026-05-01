import requests

BASE = "http://127.0.0.1:8000"

# Get all transactions
txns = requests.get(f"{BASE}/transactions", params={"limit": 100}).json()

print("=" * 90)
print(f"{'FECHA':<12} {'TIPO':<8} {'MONTO':>10}  {'DESCRIPCIÓN'}")
print("=" * 90)

total_income = 0
total_expense = 0

for t in sorted(txns, key=lambda x: x['date']):
    tipo = t['transaction_type']
    amt = t['amount']
    sign = "+" if tipo == 'income' else "-"
    if tipo == 'income':
        total_income += amt
    else:
        total_expense += amt
    print(f"{t['date'][:10]:<12} {tipo:<8} {sign}${amt:>9.2f}  {t['description']}")

print("=" * 90)
print(f"Total Ingresos:  +${total_income:.2f}")
print(f"Total Gastos:    -${total_expense:.2f}")
print(f"Neto:            ${total_income - total_expense:.2f}")
print()

# Get accounts
accs = requests.get(f"{BASE}/accounts").json()
for a in accs:
    print(f"Cuenta: {a['name']} | Saldo en sistema: ${a['balance']:.2f}")

# Register new paycheck
print("\n--- Registrando depósito fin de mes: $589.22 ---")
new_txn = {
    "amount": 589.22,
    "description": "DEPOSITO FIN DE MES - SALARIO",
    "transaction_type": "income",
    "payment_method": "transfer",
    "date": "2026-04-29T00:00:00",
    "account_id": 1
}
resp = requests.post(f"{BASE}/transactions", json=new_txn)
print(f"Status: {resp.status_code}")

# Re-calculate
txns2 = requests.get(f"{BASE}/transactions", params={"limit": 100}).json()
inc = sum(t['amount'] for t in txns2 if t['transaction_type'] == 'income')
exp = sum(t['amount'] for t in txns2 if t['transaction_type'] == 'expense')
print(f"\nNuevo Total Ingresos: +${inc:.2f}")
print(f"Nuevo Total Gastos:   -${exp:.2f}")
print(f"Nuevo Neto:           ${inc - exp:.2f}")
