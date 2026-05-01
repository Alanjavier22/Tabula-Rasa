import requests

budgets = [
    {'name': 'Google One', 'amount': 22.98, 'month': 4, 'year': 2026},
    {'name': 'Gym', 'amount': 22.50, 'month': 4, 'year': 2026},
    {'name': 'Tuenti', 'amount': 10.00, 'month': 4, 'year': 2026},
    {'name': 'Netflix', 'amount': 6.00, 'month': 4, 'year': 2026},
    {'name': 'Fiboeduc', 'amount': 50.00, 'month': 4, 'year': 2026},
    {'name': 'Laptop Dennis', 'amount': 10.00, 'month': 4, 'year': 2026},
    {'name': 'Deprati', 'amount': 11.63, 'month': 4, 'year': 2026},
    {'name': 'Saludsa', 'amount': 45.19, 'month': 4, 'year': 2026},
]

for b in budgets:
    r = requests.post('http://127.0.0.1:8000/budgets/', json=b)
    print(f'{b["name"]}: {r.status_code}', r.json() if r.status_code != 200 else 'OK')
