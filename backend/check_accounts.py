import requests

accs = requests.get('http://127.0.0.1:8000/accounts/').json()
for a in accs:
    print(f'ID: {a["id"]}, Name: {a["name"]}, Balance: {a["balance"]}, Type: {a["account_type"]}')
