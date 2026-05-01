import requests

BASE = "http://127.0.0.1:8000"
txns = requests.get(f"{BASE}/transactions", params={"limit": 100}).json()

# Find duplicates by grouping on date+description+amount
from collections import Counter

keys = []
for t in txns:
    key = f"{t['date'][:10]}|{t['description']}|{t['amount']}"
    keys.append((key, t))

# Count occurrences
key_counts = Counter(k for k, _ in keys)

print("=" * 100)
print("TRANSACCIONES DUPLICADAS (aparecen más de 1 vez):")
print("=" * 100)
seen = set()
dup_count = 0
for key, t in keys:
    if key_counts[key] > 1 and key not in seen:
        seen.add(key)
        dup_count += 1
        print(f"  ID:{t['id']:<4} {t['date'][:10]}  ${t['amount']:>9.2f}  {t['description']}")

print(f"\nTotal grupos duplicados: {dup_count}")

print("\n" + "=" * 100)
print("TRANSACCIONES 'TEST':")
print("=" * 100)
for t in txns:
    if 'test' in t['description'].lower():
        print(f"  ID:{t['id']:<4} {t['date'][:10]}  ${t['amount']:>9.2f}  {t['description']}")

print("\n" + "=" * 100)
print("DETALLE COMPLETO POR ID:")
print("=" * 100)
for t in sorted(txns, key=lambda x: x['id']):
    print(f"  ID:{t['id']:<4} {t['date'][:10]}  {t['transaction_type']:<8} ${t['amount']:>9.2f}  {t['description']}")
