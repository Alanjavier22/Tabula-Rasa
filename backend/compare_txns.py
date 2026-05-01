import requests

txns = requests.get('http://127.0.0.1:8000/transactions/?limit=200').json()
print(f'Transacciones en sistema: {len(txns)}')
for t in txns:
    print(f'{t["date"][:10]} {t["transaction_type"]:8} ${t["amount"]:8.2f} {t["description"][:40]}')
