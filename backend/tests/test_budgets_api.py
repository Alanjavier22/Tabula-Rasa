def test_budget_crud_happy_path(client):
    created = client.post("/budgets/", json={
        "name": "Comida", "amount": 30000, "month": 3, "year": 2026,
    }).json()
    budget_id = created["id"]
    assert created["amount"] == 30000
    assert "remaining" in created  # campo de pacing calculado por el backend

    r = client.get(f"/budgets/{budget_id}")
    assert r.status_code == 200

    r = client.put(f"/budgets/{budget_id}", json={"amount": 35000})
    assert r.status_code == 200
    assert r.json()["amount"] == 35000

    r = client.delete(f"/budgets/{budget_id}")
    assert r.status_code == 200
    assert client.get(f"/budgets/{budget_id}").status_code == 404


def test_generate_recurring_creates_default_budgets(client):
    r = client.post("/budgets/generate-recurring", json={
        "month": 5, "year": 2026, "delete_previous": False,
    })
    assert r.status_code == 200
    budgets = r.json()
    assert len(budgets) > 0
    assert all(b["month"] == 5 and b["year"] == 2026 for b in budgets)


def test_generate_recurring_rejects_duplicate_month(client):
    payload = {"month": 6, "year": 2026, "delete_previous": False}
    first = client.post("/budgets/generate-recurring", json=payload)
    assert first.status_code == 200

    second = client.post("/budgets/generate-recurring", json=payload)
    assert second.status_code == 400


def test_update_recurring_updates_existing_and_creates_missing(client):
    client.post("/budgets/generate-recurring", json={
        "month": 7, "year": 2026, "delete_previous": False,
        "budget_items": [{"name": "Gym", "amount": 2000}],
    })

    r = client.put("/budgets/update-recurring", json={
        "month": 7, "year": 2026,
        "budget_items": [{"name": "Gym", "amount": 3000}, {"name": "Netflix", "amount": 600}],
    })
    assert r.status_code == 200
    budgets = {b["name"]: b["amount"] for b in r.json()}
    assert budgets["Gym"] == 3000  # actualizado, no duplicado
    assert budgets["Netflix"] == 600  # creado porque no existía
