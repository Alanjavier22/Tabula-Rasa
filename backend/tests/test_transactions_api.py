import datetime


def _create_account(client, account_type="checking"):
    return client.post("/accounts/", json={
        "name": "Cuenta Test", "account_type": account_type, "balance": 0,
    }).json()


def test_create_transaction_happy_path(client):
    account = _create_account(client)

    r = client.post("/transactions/", json={
        "amount": 1500,
        "description": "Compra supermercado",
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "account_id": account["id"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["amount"] == 1500
    assert body["transaction_type"] == "expense"
    assert body["account_id"] == account["id"]


def test_import_batch(client, monkeypatch):
    # La categorización en background pega contra el SessionLocal real (no el
    # db_session de este test) y potencialmente contra una API externa de IA -
    # se neutraliza para mantener el test hermético y offline.
    monkeypatch.setattr("app.api.transactions.categorize_transactions_background", lambda ids: None)

    account = _create_account(client)
    today = datetime.datetime.now(datetime.timezone.utc).isoformat()

    r = client.post("/transactions/import-batch", json={
        "transactions": [
            {
                "description": "Import 1",
                "amount": 500,
                "transaction_type": "expense",
                "payment_method": "debit_card",
                "date": today,
                "account_id": account["id"],
            },
            {
                "description": "Import 2",
                "amount": 700,
                "transaction_type": "income",
                "payment_method": "transfer",
                "date": today,
                "account_id": account["id"],
            },
        ],
        "skip_duplicates": True,
    })
    assert r.status_code == 200
    assert r.json()["imported_count"] == 2

    all_txs = client.get("/transactions/").json()
    assert len(all_txs) == 2


def test_check_duplicates(client, db_session):
    account = _create_account(client)
    today = datetime.datetime.now(datetime.timezone.utc).isoformat()

    created = client.post("/transactions/", json={
        "amount": 999,
        "description": "Original",
        "transaction_type": "expense",
        "payment_method": "cash",
        "date": today,
        "account_id": account["id"],
    }).json()

    # POST /transactions/ no calcula `hash` (lo hace el flujo de sync LWW entre
    # dispositivos) - se setea directo para probar el endpoint de verificación.
    from app.models.transaction import Transaction
    tx = db_session.query(Transaction).filter(Transaction.id == created["id"]).first()
    tx.hash = "known-hash-abc123"
    db_session.commit()

    r = client.post("/transactions/check-duplicates", json={"hashes": ["known-hash-abc123", "nonexistent-hash"]})
    assert r.status_code == 200
    assert r.json()["existing_hashes"] == ["known-hash-abc123"]
