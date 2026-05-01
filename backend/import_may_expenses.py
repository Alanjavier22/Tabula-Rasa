import requests

BASE_URL = "http://127.0.0.1:8000/transactions/"

# Get category IDs first
categories_response = requests.get("http://127.0.0.1:8000/categories/")
categories = {cat['name']: cat['id'] for cat in categories_response.json()}

# Get account ID
accounts_response = requests.get("http://127.0.0.1:8000/accounts/")
account_id = accounts_response.json()[0]['id']

# Pending expenses for May (based on user's spreadsheet)
may_expenses = [
    {
        "description": "Google One",
        "amount": 23.00,
        "transaction_type": "expense",
        "payment_method": "credit_card",
        "date": "2026-05-01T00:00:00",
        "category_id": categories.get("Google One"),
        "account_id": account_id
    },
    {
        "description": "Gym",
        "amount": 22.50,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-05-01T00:00:00",
        "category_id": categories.get("Gym"),
        "account_id": account_id
    },
    {
        "description": "Pasaje",
        "amount": 10.00,
        "transaction_type": "expense",
        "payment_method": "cash",
        "date": "2026-05-02T00:00:00",
        "category_id": categories.get("Pasaje"),
        "account_id": account_id
    },
    {
        "description": "Netflix",
        "amount": 6.00,
        "transaction_type": "expense",
        "payment_method": "credit_card",
        "date": "2026-05-03T00:00:00",
        "category_id": categories.get("Netflix"),
        "account_id": account_id
    },
    {
        "description": "Fiboeduc",
        "amount": 50.00,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-05-04T00:00:00",
        "category_id": categories.get("Fiboeduc"),
        "account_id": account_id
    },
    {
        "description": "Tuenti",
        "amount": 10.00,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-05-05T00:00:00",
        "category_id": categories.get("Tuenti"),
        "account_id": account_id
    },
    {
        "description": "Laptop Dennis",
        "amount": 10.00,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-05-05T00:00:00",
        "category_id": categories.get("Varios"),
        "account_id": account_id
    },
    {
        "description": "Dinners",
        "amount": 64.55,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-05-06T00:00:00",
        "category_id": categories.get("Comidas"),
        "account_id": account_id
    },
    {
        "description": "Visa",
        "amount": 145.18,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-05-07T00:00:00",
        "category_id": categories.get("Tarjeta de Credito"),
        "account_id": account_id
    },
    {
        "description": "Saludsa",
        "amount": 45.19,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-05-08T00:00:00",
        "category_id": categories.get("Saludsa"),
        "account_id": account_id
    },
    {
        "description": "Varios",
        "amount": 17.96,
        "transaction_type": "expense",
        "payment_method": "cash",
        "date": "2026-05-09T00:00:00",
        "category_id": categories.get("Varios"),
        "account_id": account_id
    },
    {
        "description": "Meta",
        "amount": 100.00,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-05-10T00:00:00",
        "category_id": categories.get("Meta"),
        "account_id": account_id
    },
    {
        "description": "Deprati",
        "amount": 11.63,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-05-10T00:00:00",
        "category_id": categories.get("Deprati"),
        "account_id": account_id
    },
]

for expense in may_expenses:
    try:
        response = requests.post(BASE_URL, json=expense)
        if response.status_code == 200:
            print(f"Created: {expense['description']} - ${expense['amount']}")
        else:
            print(f"Failed to create {expense['description']}: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error creating {expense['description']}: {e}")

print("\nDone importing May expenses!")
