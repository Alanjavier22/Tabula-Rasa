import requests

BASE_URL = "http://127.0.0.1:8000/accounts/"

credit_cards = [
    {
        "name": "American Express",
        "account_type": "credit_card",
        "balance": -214.39,  # Negative because it's debt
        "currency": "USD",
        "description": "American Express - Cupo utilizado: 214.39, Disponible: 8,685.61",
        "is_active": True
    },
    {
        "name": "Visa Platinum",
        "account_type": "credit_card",
        "balance": -1495.27,  # Negative because it's debt
        "currency": "USD",
        "description": "Visa Platinum - Saldo utilizado: 1,495.27, Disponible: 4,804.73",
        "is_active": True
    },
]

for card in credit_cards:
    try:
        response = requests.post(BASE_URL, json=card)
        if response.status_code == 200:
            print(f"Created: {card['name']} - Balance: ${card['balance']}")
        else:
            print(f"Failed to create {card['name']}: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error creating {card['name']}: {e}")

print("\nDone creating credit card accounts!")
