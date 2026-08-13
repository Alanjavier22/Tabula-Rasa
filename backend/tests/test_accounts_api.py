"""
Cobertura HTTP mínima de /accounts - primer uso del fixture `client`
(TestClient + dependency_overrides). No busca cobertura exhaustiva de cada
rama: happy path + 1-2 edge cases por endpoint, como en el resto del módulo.
"""


def test_create_account_happy_path(client):
    r = client.post("/accounts/", json={
        "name": "Cuenta Ahorros",
        "account_type": "savings",
        "balance": 10000,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Cuenta Ahorros"
    assert body["account_type"] == "savings"
    assert body["balance"] == 10000


def test_create_account_invalid_account_type_returns_422(client):
    r = client.post("/accounts/", json={
        "name": "Cuenta Rara",
        "account_type": "bitcoin_wallet",
        "balance": 0,
    })
    assert r.status_code == 422


def test_get_account_not_found_returns_404(client):
    r = client.get("/accounts/does-not-exist")
    assert r.status_code == 404


def test_set_balance_and_recalculate(client):
    created = client.post("/accounts/", json={
        "name": "Cuenta Corriente",
        "account_type": "checking",
        "balance": 0,
    }).json()
    account_id = created["id"]

    r = client.post(f"/accounts/{account_id}/set-balance", json={"balance": 5000})
    assert r.status_code == 200
    assert r.json()["balance"] == 5000

    # Sin transacciones, recalcular desde un initial_balance debe reflejarlo exacto.
    r = client.post(f"/accounts/{account_id}/recalculate", params={"initial_balance": 1234})
    assert r.status_code == 200
    assert r.json()["balance"] == 1234
