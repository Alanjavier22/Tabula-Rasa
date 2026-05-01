import requests

BASE = "http://127.0.0.1:8000"
txns = requests.get(f"{BASE}/transactions", params={"limit": 100}).json()

total_income = 0
total_expense = 0

print(f"{'ID':<5} {'FECHA':<12} {'TIPO':<8} {'MONTO':>10}  {'DESCRIPCIÓN'}")
print("=" * 90)
for t in sorted(txns, key=lambda x: x['date']):
    tipo = t['transaction_type']
    amt = t['amount']
    sign = "+" if tipo == 'income' else "-"
    if tipo == 'income':
        total_income += amt
    else:
        total_expense += amt
    print(f"{t['id']:<5} {t['date'][:10]:<12} {tipo:<8} {sign}${amt:>9.2f}  {t['description']}")

print("=" * 90)
print(f"Total transacciones: {len(txns)}")
print(f"Ingresos:  +${total_income:.2f}")
print(f"Gastos:    -${total_expense:.2f}")
print(f"Neto:       ${total_income - total_expense:.2f}")
