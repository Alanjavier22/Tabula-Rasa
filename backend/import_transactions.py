import requests
from datetime import datetime

BASE_URL = "http://127.0.0.1:8000/transactions/"

# Get category IDs first
categories_response = requests.get("http://127.0.0.1:8000/categories/")
categories = {cat['name']: cat['id'] for cat in categories_response.json()}

# Get account ID
accounts_response = requests.get("http://127.0.0.1:8000/accounts/")
account_id = accounts_response.json()[0]['id']

transactions = [
    {
        "description": "CAJ/AUTO.RET.",
        "amount": 10.00,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-04-28T00:00:00",
        "category_id": categories.get("Retiro de Efectivo"),
        "account_id": account_id
    },
    {
        "description": "COMPRA MAESTRO LOCAL LA TABLITA DEL TARTARO",
        "amount": 9.99,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-04-28T00:00:00",
        "category_id": categories.get("Compras Locales"),
        "account_id": account_id
    },
    {
        "description": "TRANSFERENCIA INTERNA OTRAS CTAS ARONI MERA ALLISON DENNIS",
        "amount": 5.00,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-04-27T00:00:00",
        "category_id": categories.get("Transferencias"),
        "account_id": account_id
    },
    {
        "description": "COMPRA MAESTRO LOCAL LABRA QUE LABRA",
        "amount": 6.65,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-04-24T00:00:00",
        "category_id": categories.get("Compras Locales"),
        "account_id": account_id
    },
    {
        "description": "PAGO MATRICULA VEHICULOS AYM2505349",
        "amount": 467.49,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-04-23T00:00:00",
        "category_id": categories.get("Matricula Vehiculo"),
        "account_id": account_id
    },
    {
        "description": "RECAUD.EMP PUBLICA MUNICIPAL DE TRATR",
        "amount": 25.00,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-04-23T00:00:00",
        "category_id": categories.get("Impuestos Municipales"),
        "account_id": account_id
    },
    {
        "description": "Retiro de tu Meta SOLICITUD 0869765",
        "amount": 300.00,
        "transaction_type": "income",
        "payment_method": "transfer",
        "date": "2026-04-23T00:00:00",
        "category_id": categories.get("Meta"),
        "account_id": account_id
    },
    {
        "description": "PAGO PARA LA MATRICULA DEL CARRO ARONI MERA ALLISON DENNIS",
        "amount": 100.00,
        "transaction_type": "income",
        "payment_method": "transfer",
        "date": "2026-04-23T00:00:00",
        "category_id": categories.get("Transferencias"),
        "account_id": account_id
    },
    {
        "description": "COMPRA MAESTRO LOCAL IMP.EL ROSADO",
        "amount": 1.70,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-04-22T00:00:00",
        "category_id": categories.get("Compras Locales"),
        "account_id": account_id
    },
    {
        "description": "COMPRA MAESTRO LOCAL LA CASA DEL ENCEBOLLAD",
        "amount": 4.15,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "date": "2026-04-21T00:00:00",
        "category_id": categories.get("Compras Locales"),
        "account_id": account_id
    },
    {
        "description": "TRANSFERENCIA A OTRAS INSTITUCIONES FINANCIERAS Aroni Mera Allison Dennis",
        "amount": 145.00,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-04-20T00:00:00",
        "category_id": categories.get("Transferencias"),
        "account_id": account_id
    },
    {
        "description": "TRANSFERENCIA INTERNA OTRAS CTAS ARONI MERA ALLISON DENNIS",
        "amount": 150.00,
        "transaction_type": "income",
        "payment_method": "transfer",
        "date": "2026-04-20T00:00:00",
        "category_id": categories.get("Transferencias"),
        "account_id": account_id
    },
    {
        "description": "TRANSFERENCIA INTERNA OTRAS CTAS ARONI MERA ALLISON DENNIS",
        "amount": 10.00,
        "transaction_type": "income",
        "payment_method": "transfer",
        "date": "2026-04-18T00:00:00",
        "category_id": categories.get("Transferencias"),
        "account_id": account_id
    },
    {
        "description": "TRANSFERENCIA A OTRAS INSTITUCIONES FINANCIERAS Aroni Mera Allison Dennis",
        "amount": 20.00,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-04-18T00:00:00",
        "category_id": categories.get("Transferencias"),
        "account_id": account_id
    },
    {
        "description": "IVA SERVICIO DIGITAL AH DLC UBER RIDES",
        "amount": 0.49,
        "transaction_type": "expense",
        "payment_method": "credit_card",
        "date": "2026-04-17T00:00:00",
        "category_id": categories.get("Uber"),
        "account_id": account_id
    },
    {
        "description": "COMPRA POS INTERNACIONAL DLC UBER RIDES",
        "amount": 3.26,
        "transaction_type": "expense",
        "payment_method": "credit_card",
        "date": "2026-04-17T00:00:00",
        "category_id": categories.get("Uber"),
        "account_id": account_id
    },
    {
        "description": "COMPRA POS INTERNACIONAL REVERSO",
        "amount": 1.87,
        "transaction_type": "income",
        "payment_method": "credit_card",
        "date": "2026-04-17T00:00:00",
        "category_id": categories.get("Uber"),
        "account_id": account_id
    },
    {
        "description": "IVA SERVICIO DIGITAL AH REVERSO",
        "amount": 0.28,
        "transaction_type": "income",
        "payment_method": "credit_card",
        "date": "2026-04-17T00:00:00",
        "category_id": categories.get("Uber"),
        "account_id": account_id
    },
    {
        "description": "IVA SERVICIO DIGITAL AH DLC UBER RIDES",
        "amount": 0.33,
        "transaction_type": "expense",
        "payment_method": "credit_card",
        "date": "2026-04-17T00:00:00",
        "category_id": categories.get("Uber"),
        "account_id": account_id
    },
    {
        "description": "COMPRA POS INTERNACIONAL DLC UBER RIDES",
        "amount": 2.19,
        "transaction_type": "expense",
        "payment_method": "credit_card",
        "date": "2026-04-17T00:00:00",
        "category_id": categories.get("Uber"),
        "account_id": account_id
    },
    {
        "description": "COMPRA POS INTERNACIONAL DLC UBER RIDES",
        "amount": 1.87,
        "transaction_type": "expense",
        "payment_method": "credit_card",
        "date": "2026-04-17T00:00:00",
        "category_id": categories.get("Uber"),
        "account_id": account_id
    },
    {
        "description": "IVA SERVICIO DIGITAL AH DLC UBER RIDES",
        "amount": 0.28,
        "transaction_type": "expense",
        "payment_method": "credit_card",
        "date": "2026-04-17T00:00:00",
        "category_id": categories.get("Uber"),
        "account_id": account_id
    },
    {
        "description": "TRANSFERENCIA A OTRAS INSTITUCIONES FINANCIERAS BURGOS FUENMAYOR KEVIN BRYAN",
        "amount": 15.00,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-04-16T00:00:00",
        "category_id": categories.get("Transferencias"),
        "account_id": account_id
    },
    {
        "description": "SUELDO VIAMATICA S A",
        "amount": 201.82,
        "transaction_type": "income",
        "payment_method": "transfer",
        "date": "2026-04-16T00:00:00",
        "category_id": categories.get("Sueldo"),
        "account_id": account_id
    },
    {
        "description": "PAGO TARJETA OTRAS INSTITUCIONES FINANCIERAS ARONI MERA ALLISON DENNIS",
        "amount": 100.28,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "date": "2026-04-16T00:00:00",
        "category_id": categories.get("Tarjeta de Credito"),
        "account_id": account_id
    },
    {
        "description": "TRANSFERENCIA INTERNA OTRAS CTAS ARONI MERA ALLISON DENNIS",
        "amount": 100.28,
        "transaction_type": "income",
        "payment_method": "transfer",
        "date": "2026-04-16T00:00:00",
        "category_id": categories.get("Transferencias"),
        "account_id": account_id
    },
]

for transaction in transactions:
    try:
        response = requests.post(BASE_URL, json=transaction)
        if response.status_code == 200:
            print(f"Created: {transaction['description']} - ${transaction['amount']}")
        else:
            print(f"Failed to create {transaction['description']}: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error creating {transaction['description']}: {e}")

print("\nDone importing transactions!")
