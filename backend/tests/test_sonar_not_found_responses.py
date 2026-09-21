"""Cubre las respuestas 404 documentadas en endpoints revisados por SonarCloud."""


def test_not_found_responses_are_reachable(client):
    responses = [
        client.get("/statements/missing"),
        client.put("/statements/missing", json={}),
        client.delete("/statements/missing"),
        client.post(
            "/statements/missing/shares",
            json={"person_name": "Prueba", "amount": 1},
        ),
        client.get("/goals/missing"),
        client.put("/goals/missing", json={}),
        client.delete("/goals/missing"),
        client.get("/config/missing"),
        client.put("/config/missing", json={}),
        client.delete("/config/missing"),
        client.get("/budgets/missing"),
        client.put("/budgets/missing", json={}),
        client.delete("/budgets/missing"),
        client.get("/snapshots/missing"),
        client.delete("/snapshots/missing"),
        client.post("/snapshots/missing/analyze"),
        client.post("/snapshots/missing/reconcile"),
        client.post("/snapshots/missing/lock"),
        client.post("/transaction-splits/batch/missing", json=[]),
    ]

    assert all(response.status_code == 404 for response in responses)
